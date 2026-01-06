"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateAnswerForQuestion, fetchFileAsBase64 } from "./llm";
import { GoogleGenAI, Part } from "@google/genai";

export const generateAnswers = action({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, args): Promise<{ success: boolean; processed?: number; error?: string }> => {
    const currentStatus = await ctx.runQuery(internal.questions.getAssignmentStatus, {
      assignmentId: args.assignmentId,
    });
    if (currentStatus?.status === "error") {
      return { success: false, error: currentStatus.error ?? "Processing stopped" };
    }

    // Get pending questions
    const questions = await ctx.runQuery(
      internal.questions.getPendingQuestions,
      { assignmentId: args.assignmentId },
    );

    if (questions.length === 0) {
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
          const { data, mimeType } = await fetchFileAsBase64(file.url as string);
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

    // Process questions ONE AT A TIME for real-time progress feedback
    for (const q of questions) {
      const status = await ctx.runQuery(internal.questions.getAssignmentStatus, {
        assignmentId: args.assignmentId,
      });
      if (status?.status === "error") {
        abortedMessage = status.error ?? "Processing stopped";
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
          abortedMessage = statusAfterMark.error ?? "Processing stopped";
          break;
        }

        // Generate answer for this specific question
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
          abortedMessage = statusBeforeWrite.error ?? "Processing stopped";
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

        processed++;
      } catch (error) {
        console.error(`Error generating answer for Q${q.questionNumber}:`, error);
        errors++;

        // Reset question to pending so it can be retried cleanly
        await ctx.runMutation(internal.questions.markQuestionPending, {
          questionId: q._id,
        });
      }
    }

    if (abortedMessage) {
      return {
        success: false,
        processed,
        error: abortedMessage,
      };
    }

    // Update assignment status
    await ctx.runMutation(internal.questions.updateAssignmentStatus, {
      assignmentId: args.assignmentId,
      status: errors > 0 ? "error" : "ready",
      error: errors > 0 ? `${errors} question(s) failed` : undefined,
    });

    return {
      success: errors === 0,
      processed,
      error: errors > 0 ? `${errors} question(s) failed to generate` : undefined,
    };
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
    const notesUrls = await ctx.runQuery(internal.questions.getNotesForAssignment, {
      assignmentId: question.assignmentId,
    });

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
      let additionalInstructionsForAnswer = question.additionalInstructionsForAnswer || "";
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
