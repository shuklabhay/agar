"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateAnswerForQuestion, fetchFileAsBase64 } from "./llm";
import { GoogleGenAI, Part } from "@google/genai";

const BATCH_SIZE = 4;
const MAX_PARALLEL_BATCHES = 2;

function formatError(error: unknown): string {
  if (error instanceof Error)
    return error.message || error.name || "Unknown error";
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

export const generateAnswers = action({
  args: {
    assignmentId: v.id("assignments"),
    allowResume: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; processed?: number; error?: string }> => {
    try {
      const currentStatus = await ctx.runQuery(
        internal.questions.getAssignmentStatus,
        {
          assignmentId: args.assignmentId,
        },
      );
      if (currentStatus?.status === "error" && !args.allowResume) {
        return {
          success: false,
          error: currentStatus.error ?? "Processing stopped",
        };
      }
      if (currentStatus?.status === "error" && args.allowResume) {
        await ctx.runMutation(internal.questions.updateAssignmentStatus, {
          assignmentId: args.assignmentId,
          status: "pending",
          error: undefined,
        });
      }

      // Get pending questions
      const questions = await ctx.runQuery(
        internal.questions.getPendingQuestions,
        { assignmentId: args.assignmentId },
      );

      if (questions.length === 0) {
        await ctx.runMutation(internal.questions.updateAssignmentStatus, {
          assignmentId: args.assignmentId,
          status: "ready",
          error: undefined,
        });
        return { success: true, processed: 0 };
      }

      // Get assignment (for assignment file URLs)
      const assignment = await ctx.runQuery(
        internal.questions.getAssignmentForProcessing,
        { assignmentId: args.assignmentId },
      );

      if (!assignment) {
        return { success: false, error: "Assignment not found" };
      }

      // Get notes file URLs
      const notesUrls = await ctx.runQuery(
        internal.questions.getNotesForAssignment,
        { assignmentId: args.assignmentId },
      );

      // Update assignment status
      await ctx.runMutation(internal.questions.updateAssignmentStatus, {
        assignmentId: args.assignmentId,
        status: "generating_answers",
      });

      // Prepare notes files once (reuse across all questions)
      const notesParts: Part[] = await Promise.all(
        notesUrls.map(async (url: string) => {
          const { data, mimeType } = await fetchFileAsBase64(url);
          return { inlineData: { data, mimeType } };
        }),
      );
      // Prepare assignment files once (reuse across all questions)
      const assignmentParts: Part[] = await Promise.all(
        (assignment.assignmentFiles || [])
          .filter((f) => f.url)
          .map(async (file) => {
            const { data, mimeType } = await fetchFileAsBase64(
              file.url as string,
            );
            return { inlineData: { data, mimeType } };
          }),
      );
      const contextParts = [...notesParts, ...assignmentParts];

      // Get Gemini client
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return { success: false, error: "GEMINI_API_KEY not configured" };
      }
      const client = new GoogleGenAI({ apiKey });

      let processed = 0;
      let errors = 0;
      let abortedMessage: string | null = null;

      // Helper to process a batch of questions sequentially, sharing the same context window
      const processBatch = async (batch: typeof questions) => {
        let batchProcessed = 0;
        let batchErrors = 0;
        let batchAborted: string | null = null;

        for (const q of batch) {
          const status = await ctx.runQuery(
            internal.questions.getAssignmentStatus,
            {
              assignmentId: args.assignmentId,
            },
          );
          if (status?.status === "error") {
            batchAborted = status.error ?? "Processing stopped";
            break;
          }

          try {
            // Mark question as processing (visible in UI immediately)
            await ctx.runMutation(internal.questions.markQuestionProcessing, {
              questionId: q._id,
            });

            // If a stop was requested after we marked processing, honor it
            const statusAfterMark = await ctx.runQuery(
              internal.questions.getAssignmentStatus,
              { assignmentId: args.assignmentId },
            );
            if (statusAfterMark?.status === "error") {
              await ctx.runMutation(internal.questions.markQuestionPending, {
                questionId: q._id,
              });
              batchAborted = statusAfterMark.error ?? "Processing stopped";
              break;
            }

            // Generate answer for this specific question using the shared contextParts
            const answer = await generateAnswerForQuestion(
              q.questionNumber,
              q.questionText,
              q.questionType,
              q.additionalInstructionsForAnswer,
              q.additionalInstructionsForWork,
              contextParts,
              client,
              q.answerOptionsMCQ,
            );

            // If stopped during LLM call, do not write the answer
            const statusBeforeWrite = await ctx.runQuery(
              internal.questions.getAssignmentStatus,
              { assignmentId: args.assignmentId },
            );
            if (statusBeforeWrite?.status === "error") {
              await ctx.runMutation(internal.questions.markQuestionPending, {
                questionId: q._id,
              });
              batchAborted = statusBeforeWrite.error ?? "Processing stopped";
              break;
            }

            // Update question with answer (visible in UI immediately)
            await ctx.runMutation(internal.questions.updateQuestionAnswer, {
              questionId: q._id,
              answer: answer.answer,
              keyPoints: answer.keyPoints,
              source: answer.source,
              status: "ready",
            });

            batchProcessed++;
          } catch (error) {
            console.error(
              `Error generating answer for Q${q.questionNumber}:`,
              error,
            );
            batchErrors++;

            // Reset question to pending so it can be retried cleanly
            await ctx.runMutation(internal.questions.markQuestionPending, {
              questionId: q._id,
            });
          }
        }

        return {
          processed: batchProcessed,
          errors: batchErrors,
          abortedMessage: batchAborted,
        };
      };

      // Chunk questions into batches of BATCH_SIZE
      const batches: (typeof questions)[] = [];
      for (let i = 0; i < questions.length; i += BATCH_SIZE) {
        batches.push(questions.slice(i, i + BATCH_SIZE));
      }

      // Process batches with limited parallelism; start next batch as soon as one finishes
      const active: Promise<void>[] = [];
      let nextBatch = 0;

      const launchBatch = (batch: typeof questions) => {
        const run = (async () => {
          const result = await processBatch(batch);
          processed += result.processed;
          errors += result.errors;
          if (result.abortedMessage && !abortedMessage) {
            abortedMessage = result.abortedMessage;
          }
        })();

        const wrapped = run.finally(() => {
          const idx = active.indexOf(wrapped);
          if (idx !== -1) active.splice(idx, 1);
        });
        active.push(wrapped);
      };

      while (
        (nextBatch < batches.length || active.length > 0) &&
        !abortedMessage
      ) {
        while (
          active.length < MAX_PARALLEL_BATCHES &&
          nextBatch < batches.length &&
          !abortedMessage
        ) {
          launchBatch(batches[nextBatch]);
          nextBatch++;
        }

        if (active.length > 0) {
          await Promise.race(active);
        }
      }

      if (abortedMessage) {
        return {
          success: false,
          processed,
          error: abortedMessage,
        };
      }

      const errorSummary =
        errors > 0 ? `${errors} question(s) failed to generate` : undefined;

      // Always mark as ready; individual questions remain pending for retry
      await ctx.runMutation(internal.questions.updateAssignmentStatus, {
        assignmentId: args.assignmentId,
        status: "ready",
        error: undefined,
      });

      return {
        success: true,
        processed,
        error: errorSummary,
      };
    } catch (error) {
      const message = formatError(error);
      console.error("generateAnswers fatal error:", message, error);
      await ctx.runMutation(internal.questions.updateAssignmentStatus, {
        assignmentId: args.assignmentId,
        status: "error",
        error: message,
      });
      return { success: false, error: message };
    }
  },
});

// Regenerate answer for a single question (with optional feedback)
export const regenerateAnswer = action({
  args: {
    questionId: v.id("questions"),
    feedback: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    // Get the question
    const question = await ctx.runQuery(internal.questions.getQuestion, {
      questionId: args.questionId,
    });

    if (!question) {
      return { success: false, error: "Question not found" };
    }

    // Mark as processing
    await ctx.runMutation(internal.questions.markQuestionProcessing, {
      questionId: args.questionId,
    });

    // Get notes file URLs
    const notesUrls = await ctx.runQuery(
      internal.questions.getNotesForAssignment,
      {
        assignmentId: question.assignmentId,
      },
    );

    try {
      // Prepare notes parts
      const notesParts: Part[] = await Promise.all(
        notesUrls.map(async (url: string) => {
          const { data, mimeType } = await fetchFileAsBase64(url);
          return { inlineData: { data, mimeType } };
        }),
      );

      // Prepare assignment parts
      const assignment = await ctx.runQuery(
        internal.questions.getAssignmentForProcessing,
        { assignmentId: question.assignmentId },
      );
      const assignmentParts: Part[] = assignment
        ? await Promise.all(
            (assignment.assignmentFiles || [])
              .filter((f) => f.url)
              .map(async (file) => {
                const { data, mimeType } = await fetchFileAsBase64(
                  file.url as string,
                );
                return { inlineData: { data, mimeType } };
              }),
          )
        : [];
      const contextParts = [...notesParts, ...assignmentParts];

      // Get Gemini client
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
      const client = new GoogleGenAI({ apiKey });

      // Build teacher info with feedback if provided
      let additionalInstructionsForAnswer =
        question.additionalInstructionsForAnswer || "";
      if (args.feedback) {
        additionalInstructionsForAnswer = additionalInstructionsForAnswer
          ? `${additionalInstructionsForAnswer}\n\nTeacher feedback for regeneration: ${args.feedback}`
          : `Teacher feedback for regeneration: ${args.feedback}`;
      }

      // Generate new answer
      const answer = await generateAnswerForQuestion(
        question.questionNumber,
        question.questionText,
        question.questionType,
        additionalInstructionsForAnswer,
        question.additionalInstructionsForWork,
        contextParts,
        client,
        question.answerOptionsMCQ,
      );

      // Update the question
      await ctx.runMutation(internal.questions.updateQuestionAnswer, {
        questionId: args.questionId,
        answer: answer.answer,
        keyPoints: answer.keyPoints,
        source: answer.source,
        status: "ready",
      });

      return { success: true };
    } catch (error) {
      console.error("Regeneration error:", error);

      // Reset status to ready (previous answer preserved)
      await ctx.runMutation(internal.questions.updateQuestionAnswer, {
        questionId: args.questionId,
        answer: question.answer || "",
        keyPoints: question.keyPoints || [],
        source: question.source || "notes",
        status: "ready",
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
