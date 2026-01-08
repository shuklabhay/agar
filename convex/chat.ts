import { v } from "convex/values";
import { query, action, internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const RATE_LIMITS = {
  perMinute: 100,
  perDay: 1000,
};

const MAX_CONTEXT_FILE_BYTES = 5 * 1024 * 1024; // 5MB limit for LLM context attachments

type RateLimitScope = "minute" | "day";

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Lightweight base64 decoder that works in the Convex default runtime
function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  const bytesLength = (clean.length * 3) / 4 - padding;
  const bytes = new Uint8Array(bytesLength);
  let byteIndex = 0;

  for (let i = 0; i < clean.length; i += 4) {
    const chunk =
      (decodeChar(clean.charCodeAt(i)) << 18) |
      (decodeChar(clean.charCodeAt(i + 1)) << 12) |
      (decodeChar(clean.charCodeAt(i + 2)) << 6) |
      decodeChar(clean.charCodeAt(i + 3));

    bytes[byteIndex++] = (chunk >> 16) & 0xff;
    if (byteIndex < bytesLength) bytes[byteIndex++] = (chunk >> 8) & 0xff;
    if (byteIndex < bytesLength) bytes[byteIndex++] = chunk & 0xff;
  }

  return bytes;
}

function decodeChar(charCode: number): number {
  if (charCode >= 65 && charCode <= 90) return charCode - 65; // A-Z
  if (charCode >= 97 && charCode <= 122) return charCode - 71; // a-z
  if (charCode >= 48 && charCode <= 57) return charCode + 4; // 0-9
  if (charCode === 43) return 62; // +
  if (charCode === 47) return 63; // /
  if (charCode === 61) return 0; // =
  return 0;
}

// Encode Uint8Array to base64 without Buffer (Convex default runtime safe)
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let output = "";
  let i = 0;

  for (; i + 2 < bytes.length; i += 3) {
    output += BASE64_CHARS[bytes[i] >> 2];
    output += BASE64_CHARS[((bytes[i] & 0x03) << 4) | (bytes[i + 1] >> 4)];
    output += BASE64_CHARS[((bytes[i + 1] & 0x0f) << 2) | (bytes[i + 2] >> 6)];
    output += BASE64_CHARS[bytes[i + 2] & 0x3f];
  }

  const remaining = bytes.length - i;
  if (remaining === 1) {
    output += BASE64_CHARS[bytes[i] >> 2];
    output += BASE64_CHARS[(bytes[i] & 0x03) << 4];
    output += "==";
  } else if (remaining === 2) {
    output += BASE64_CHARS[bytes[i] >> 2];
    output += BASE64_CHARS[((bytes[i] & 0x03) << 4) | (bytes[i + 1] >> 4)];
    output += BASE64_CHARS[(bytes[i + 1] & 0x0f) << 2];
    output += "=";
  }

  return output;
}

function detectMCQOption(message: string, options?: string[]): string | undefined {
  if (!options || options.length === 0) return;
  const lower = message.toLowerCase();

  // Direct letter mention (e.g., "C", "option C")
  const letterMatch = lower.match(/\b([a-d])\b/);
  if (letterMatch) return letterMatch[1].toUpperCase();

  // Option text mention (e.g., "amount")
  const matches: string[] = [];
  options.forEach((opt, idx) => {
    if (lower.includes(opt.toLowerCase())) {
      matches.push(String.fromCharCode(65 + idx));
    }
  });

  return matches.length === 1 ? matches[0] : undefined;
}

function deriveCorrectLetters(answer: unknown, options?: string[]): string[] {
  const letters: string[] = [];
  if (!answer) return letters;

  const pushLetter = (val: string) => {
    const letter = val.trim().toUpperCase();
    if (["A", "B", "C", "D"].includes(letter)) {
      letters.push(letter);
      return;
    }
    if (options && options.length > 0) {
      const idx = options.findIndex(
        (opt) => opt.toLowerCase().trim() === val.toLowerCase().trim(),
      );
      if (idx >= 0) letters.push(String.fromCharCode(65 + idx));
    }
  };

  if (Array.isArray(answer)) {
    answer.forEach((a) => {
      if (typeof a === "string") pushLetter(a);
    });
  } else if (typeof answer === "string") {
    pushLetter(answer);
  }

  return letters;
}

async function loadAssignmentContextFile(ctx: ActionCtx, assignmentId: Id<"assignments">) {
  const assignment = await ctx.runQuery(
    internal.questions.getAssignmentForProcessing,
    { assignmentId },
  );
  if (!assignment || assignment.assignmentFiles.length === 0) return;

  const primaryFile = assignment.assignmentFiles[0];
  const size = primaryFile.size ?? 0;
  if (size > MAX_CONTEXT_FILE_BYTES) return;

  const blob = await ctx.storage.get(primaryFile.storageId);
  if (!blob) return;

  const arrayBuffer = await blob.arrayBuffer();
  const base64Data = uint8ArrayToBase64(new Uint8Array(arrayBuffer));

  return {
    name: primaryFile.fileName,
    type: primaryFile.contentType ?? "application/octet-stream",
    data: base64Data,
  };
}

async function checkRateLimit(
  ctx: ActionCtx,
  sessionId: Id<"studentSessions">,
): Promise<{ scope: RateLimitScope; retryAfterMs: number; limit: number } | null> {
  const now = Date.now();
  const minuteAgo = now - 60_000;
  const dayAgo = now - 86_400_000;

  const recent = await ctx.runQuery(internal.chat.getRecentStudentMessages, {
    sessionId,
    since: dayAgo,
  });

  const dayCount = recent.length;
  const minuteTimestamps = recent.filter((ts) => ts >= minuteAgo);

  if (dayCount >= RATE_LIMITS.perDay) {
    const earliest = Math.min(...recent);
    const retryAfterMs = Math.max(0, 86_400_000 - (now - earliest));
    return { scope: "day", retryAfterMs, limit: RATE_LIMITS.perDay };
  }

  if (minuteTimestamps.length >= RATE_LIMITS.perMinute) {
    const earliest = Math.min(...minuteTimestamps);
    const retryAfterMs = Math.max(0, 60_000 - (now - earliest));
    return { scope: "minute", retryAfterMs, limit: RATE_LIMITS.perMinute };
  }

  return null;
}

// Exported for testing / diagnostics only (not used by clients)
export { checkRateLimit };

// PUBLIC: Get chat history for a question
export const getChatHistory = query({
  args: {
    sessionId: v.id("studentSessions"),
    questionId: v.id("questions"),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_session_question", (q) =>
        q.eq("sessionId", args.sessionId).eq("questionId", args.questionId)
      )
      .collect();

    const withUrls = await Promise.all(
      messages.map(async (m) => {
        if (!m.attachments || m.attachments.length === 0) return m;
        const attachments = await Promise.all(
          m.attachments.map(async (att) => {
            let url: string | null = null;
            try {
              url = await ctx.storage.getUrl(att.storageId);
            } catch (err) {
              console.error("Failed to fetch attachment URL", err);
            }
            return { ...att, url: url ?? undefined };
          }),
        );
        return { ...m, attachments };
      }),
    );

    return withUrls;
  },
});

// INTERNAL: Record student upload metadata
export const recordStudentUpload = internalMutation({
  args: {
    sessionId: v.id("studentSessions"),
    questionId: v.id("questions"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("studentUploads", {
      sessionId: args.sessionId,
      questionId: args.questionId,
      storageId: args.storageId,
      fileName: args.fileName,
      contentType: args.contentType,
      uploadedAt: Date.now(),
    });
  },
});

// PUBLIC: Get all chat history for a session (persists across questions)
export const getSessionChatHistory = query({
  args: {
    sessionId: v.id("studentSessions"),
  },
  handler: async (ctx, args) => {
    // Get all messages for this session using index, sorted by timestamp
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const withUrls = await Promise.all(
      messages.map(async (m) => {
        if (!m.attachments || m.attachments.length === 0) return m;
        const attachments = await Promise.all(
          m.attachments.map(async (att) => {
            let url: string | null = null;
            try {
              url = await ctx.storage.getUrl(att.storageId);
            } catch (err) {
              console.error("Failed to fetch attachment URL", err);
            }
            return { ...att, url: url ?? undefined };
          }),
        );
        return { ...m, attachments };
      }),
    );

    return withUrls.sort((a, b) => a.timestamp - b.timestamp);
  },
});

// INTERNAL: Recent student messages (timestamps) for rate limiting
export const getRecentStudentMessages = internalQuery({
  args: {
    sessionId: v.id("studentSessions"),
    since: v.number(),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("role"), "student"))
      .filter((q) => q.gte(q.field("timestamp"), args.since))
      .collect();

    return messages.map((m) => m.timestamp);
  },
});

// INTERNAL: Add a message to chat history
export const addMessage = internalMutation({
  args: {
    sessionId: v.id("studentSessions"),
    questionId: v.id("questions"),
    assignmentId: v.optional(v.id("assignments")),
    classId: v.optional(v.id("classes")),
    role: v.union(v.literal("student"), v.literal("tutor"), v.literal("system")),
    content: v.string(),
    toolCall: v.optional(
      v.object({
        name: v.string(),
        args: v.any(),
        result: v.optional(v.any()),
      })
    ),
    attachments: v.optional(
      v.array(
        v.object({
          name: v.string(),
          type: v.string(),
          storageId: v.id("_storage"),
          url: v.optional(v.string()),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    let assignmentId = args.assignmentId;
    if (!assignmentId) {
      const session = await ctx.db.get(args.sessionId);
      assignmentId = session?.assignmentId;
    }

    return await ctx.db.insert("chatMessages", {
      sessionId: args.sessionId,
      questionId: args.questionId,
      assignmentId: assignmentId ?? undefined,
      classId: args.classId ?? undefined,
      role: args.role,
      content: args.content,
      timestamp: Date.now(),
      toolCall: args.toolCall,
      attachments: args.attachments,
    });
  },
});

// INTERNAL: Get question with full answer info (for tutor context)
export const getQuestionForTutor = internalQuery({
  args: { questionId: v.id("questions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.questionId);
  },
});

// INTERNAL: Get progress for question
export const getProgressForTutor = internalQuery({
  args: {
    sessionId: v.id("studentSessions"),
    questionId: v.id("questions"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("studentProgress")
      .withIndex("by_sessionId_questionId", (q) =>
        q.eq("sessionId", args.sessionId).eq("questionId", args.questionId)
      )
      .first();
  },
});

// PUBLIC: Send message to tutor (action that calls LLM)
export const sendMessageToTutor = action({
  args: {
    sessionId: v.id("studentSessions"),
    questionId: v.id("questions"),
    message: v.string(),
    selectedOption: v.optional(v.string()),
    files: v.optional(
      v.array(
        v.object({
          name: v.string(),
          type: v.string(),
          data: v.string(), // base64 data URL
        })
      )
    ),
  },
  handler: async (ctx, args): Promise<{
    message: string;
    toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
    rateLimited?: { scope: RateLimitScope; retryAfterMs: number; limit: number };
  }> => {
    const rateLimit = await checkRateLimit(ctx, args.sessionId);
    if (rateLimit) {
      await ctx.runMutation(internal.chat.addMessage, {
        sessionId: args.sessionId,
        questionId: args.questionId,
        role: "system",
        content: `You are sending messages too quickly (limit ${rateLimit.limit} per ${rateLimit.scope}). Try again in ${Math.ceil(rateLimit.retryAfterMs / 1000)} seconds.`,
      });
      return {
        message: "",
        rateLimited: rateLimit,
      };
    }

    // Get question with full context
    const question = await ctx.runQuery(internal.chat.getQuestionForTutor, {
      questionId: args.questionId,
    });
    const assignmentId = question?.assignmentId;

    if (!question) {
      throw new Error("Question not found");
    }

    // Only attach the source file on the very first chat turn for this session
    const sessionChat = await ctx.runQuery(api.chat.getSessionChatHistory, {
      sessionId: args.sessionId,
    });
    const hasSessionChat = sessionChat.length > 0;

    const contextFile =
      !hasSessionChat &&
      question.assignmentId &&
      (await loadAssignmentContextFile(ctx, question.assignmentId));

    // Get chat history
    const history = await ctx.runQuery(api.chat.getChatHistory, {
      sessionId: args.sessionId,
      questionId: args.questionId,
    });

    // Get progress
    const progress = await ctx.runQuery(internal.chat.getProgressForTutor, {
      sessionId: args.sessionId,
      questionId: args.questionId,
    });

    // Save student message (with attachments stored)
    let storedAttachments:
      | Array<{ name: string; type: string; storageId: Id<"_storage"> }>
      | undefined;

    if (args.files && args.files.length > 0) {
      storedAttachments = [];
      for (const file of args.files) {
        const base64Data = file.data.split(",")[1] || file.data;
        const binary = base64ToUint8Array(base64Data);
        const copy = Uint8Array.from(binary);
        const storageId = await ctx.storage.store(new Blob([copy], { type: file.type }));
        storedAttachments.push({
          name: file.name,
          type: file.type,
          storageId,
        });

        await ctx.runMutation(internal.chat.recordStudentUpload, {
          sessionId: args.sessionId,
          questionId: args.questionId,
          storageId,
          fileName: file.name,
          contentType: file.type,
        });
      }
    }

    // Save student message
    await ctx.runMutation(internal.chat.addMessage, {
      sessionId: args.sessionId,
      questionId: args.questionId,
      assignmentId,
      role: "student",
      content: args.message,
      attachments: storedAttachments,
    });

    const parsedSelectedOption =
      question.questionType === "multiple_choice"
        ? args.selectedOption ??
          detectMCQOption(args.message, question.answerOptionsMCQ)
        : undefined;

    // Call the tutor LLM
    const { callTutorLLM } = await import("./tutorLLM");

    const response = await callTutorLLM({
      question: {
        questionText: question.questionText,
        questionType: question.questionType,
        answerOptionsMCQ: question.answerOptionsMCQ,
        answer: question.answer,
        keyPoints: question.keyPoints,
        additionalInstructionsForWork: question.additionalInstructionsForWork,
        questionNumber: question.questionNumber,
      },
      history: history.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
      studentMessage: args.message,
      selectedOption: parsedSelectedOption,
      files: [...(contextFile ? [contextFile] : []), ...(args.files ?? [])],
      attempts: progress?.attempts,
    });

    // Handle tool calls (evaluate response)
    let progressUpdated = false;
    if (response.toolCalls && response.toolCalls.length > 0) {
      for (const toolCall of response.toolCalls) {
        if (toolCall.name === "evaluate_response" && progress) {
          const reportedIsCorrect = Boolean(toolCall.args.isCorrect);
          const detectedAnswer =
            typeof toolCall.args.detectedAnswer === "string"
              ? toolCall.args.detectedAnswer
              : parsedSelectedOption;
          const isMCQ = question.questionType === "multiple_choice";

          const correctLetters = deriveCorrectLetters(
            question.answer,
            question.answerOptionsMCQ,
          );
          const answerLetter = isMCQ
            ? detectedAnswer ?? parsedSelectedOption
            : undefined;

          // Only log MCQ attempts when a letter guess is present
          if (isMCQ && !answerLetter) {
            continue;
          }

          // Do not mark the correct letter as incorrect
          const computedCorrect =
            isMCQ && answerLetter
              ? correctLetters.includes(answerLetter)
              : reportedIsCorrect;
          const isCorrect = reportedIsCorrect || computedCorrect;

          await ctx.runMutation(internal.studentProgress.updateProgressStatus, {
            progressId: progress._id,
            status: isCorrect ? "correct" : "incorrect",
            submittedText: !isMCQ ? detectedAnswer : undefined,
            selectedAnswer: isMCQ ? answerLetter : undefined,
            advanceOnCorrect: isCorrect ? true : undefined,
          });
          progressUpdated = true;
        }
      }
    }

    // Fallback: if LLM missed the tool call but we parsed an MCQ guess, log it
    if (
      !progressUpdated &&
      question.questionType === "multiple_choice" &&
      progress &&
      parsedSelectedOption &&
      (progress.attempts ?? 0) === 0
    ) {
      const correctLetters = deriveCorrectLetters(
        question.answer,
        question.answerOptionsMCQ,
      );
      if (correctLetters.length > 0) {
        const isCorrect = correctLetters.includes(parsedSelectedOption);
        await ctx.runMutation(internal.studentProgress.updateProgressStatus, {
          progressId: progress._id,
          status: isCorrect ? "correct" : "incorrect",
          selectedAnswer: parsedSelectedOption,
          advanceOnCorrect: true,
        });
        progressUpdated = true;
      }
    }

    // Save tutor response
    const toolCallToStore =
      response.toolCalls?.find((call) => call.name === "evaluate_response") ??
      response.toolCalls?.[0];

    await ctx.runMutation(internal.chat.addMessage, {
      sessionId: args.sessionId,
      questionId: args.questionId,
      assignmentId,
      role: "tutor",
      content: response.message,
      toolCall: toolCallToStore
        ? {
            name: toolCallToStore.name,
            args: {
              ...toolCallToStore.args,
              questionNumber: question.questionNumber,
            },
          }
        : undefined,
    });

    return {
      message: response.message,
      toolCalls: response.toolCalls,
    };
  },
});
