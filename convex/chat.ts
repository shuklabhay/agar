import { v } from "convex/values";
import { query, action, internalMutation, internalQuery } from "./_generated/server";
import { internal, api } from "./_generated/api";

// PUBLIC: Get chat history for a question
export const getChatHistory = query({
  args: {
    sessionId: v.id("studentSessions"),
    questionId: v.id("questions"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chatMessages")
      .withIndex("by_session_question", (q) =>
        q.eq("sessionId", args.sessionId).eq("questionId", args.questionId)
      )
      .collect();
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

    return messages.sort((a, b) => a.timestamp - b.timestamp);
  },
});

// INTERNAL: Add a message to chat history
export const addMessage = internalMutation({
  args: {
    sessionId: v.id("studentSessions"),
    questionId: v.id("questions"),
    role: v.union(v.literal("student"), v.literal("tutor"), v.literal("system")),
    content: v.string(),
    toolCall: v.optional(
      v.object({
        name: v.string(),
        args: v.any(),
        result: v.optional(v.any()),
      })
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("chatMessages", {
      sessionId: args.sessionId,
      questionId: args.questionId,
      role: args.role,
      content: args.content,
      timestamp: Date.now(),
      toolCall: args.toolCall,
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
  handler: async (ctx, args): Promise<{ message: string; toolCalls?: Array<{ name: string; args: Record<string, unknown> }> }> => {
    // Get question with full context
    const question = await ctx.runQuery(internal.chat.getQuestionForTutor, {
      questionId: args.questionId,
    });

    if (!question) {
      throw new Error("Question not found");
    }

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

    // Save student message
    await ctx.runMutation(internal.chat.addMessage, {
      sessionId: args.sessionId,
      questionId: args.questionId,
      role: "student",
      content: args.message,
    });

    // Call the tutor LLM
    const { callTutorLLM } = await import("./tutorLLM");

    // First message for this question gets the full context with keyPoints
    const isFirstMessageForQuestion = history.length === 0;

    const response = await callTutorLLM({
      question: {
        questionText: question.questionText,
        questionType: question.questionType,
        answerOptionsMCQ: question.answerOptionsMCQ,
        answer: question.answer,
        // Only include keyPoints on first message - they'll be in history for subsequent calls
        keyPoints: isFirstMessageForQuestion ? question.keyPoints : undefined,
        additionalInstructionsForWork: question.additionalInstructionsForWork,
      },
      history: history.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      studentMessage: args.message,
      files: args.files,
      isFirstMessageForQuestion,
    });

    // Handle tool calls (mark correct, etc.)
    if (response.toolCalls && response.toolCalls.length > 0) {
      for (const toolCall of response.toolCalls) {
        if (toolCall.name === "mark_answer_correct" && progress) {
          await ctx.runMutation(internal.studentProgress.updateProgressStatus, {
            progressId: progress._id,
            status: "correct",
            submittedText: toolCall.args.detectedAnswer as string | undefined,
          });
        }
        if (toolCall.name === "evaluate_response" && progress) {
          const isCorrect = toolCall.args.isCorrect as boolean;
          await ctx.runMutation(internal.studentProgress.updateProgressStatus, {
            progressId: progress._id,
            status: isCorrect ? "correct" : "incorrect",
          });
        }
      }
    }

    // Save tutor response
    await ctx.runMutation(internal.chat.addMessage, {
      sessionId: args.sessionId,
      questionId: args.questionId,
      role: "tutor",
      content: response.message,
      toolCall: response.toolCalls?.[0]
        ? {
            name: response.toolCalls[0].name,
            args: {
              ...response.toolCalls[0].args,
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
