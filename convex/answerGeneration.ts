"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateAnswersForQuestions, generateAnswerForQuestion, fetchFileAsBase64 } from "./llm";
import { GoogleGenAI, Part } from "@google/genai";

export const generateAnswers = action({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, args): Promise<{ success: boolean; processed?: number; error?: string }> => {
    // Get pending questions
    const questions = await ctx.runQuery(
      internal.questions.getPendingQuestions,
      { assignmentId: args.assignmentId },
    );

    if (questions.length === 0) {
      return { success: true, processed: 0 };
    }

    // Get notes file URLs
    const notesUrls = await ctx.runQuery(
      internal.questions.getNotesForAssignment,
      { assignmentId: args.assignmentId },
    );

    if (notesUrls.length === 0) {
      return { success: false, error: "No notes files found for this assignment" };
    }

    // Update assignment status
    await ctx.runMutation(internal.questions.updateAssignmentStatus, {
      assignmentId: args.assignmentId,
      status: "generating_answers",
    });

    try {
      // Prepare questions for LLM
      const questionsForLLM = questions.map((q) => ({
        questionNumber: q.questionNumber,
        questionText: q.questionText,
        questionType: q.questionType,
        teacherInfo: q.teacherInfo,
      }));

      // Generate answers
      const answers = await generateAnswersForQuestions(questionsForLLM, notesUrls);

      // Update each question with its answer
      let processed = 0;
      for (const q of questions) {
        const answer = answers.get(q.questionNumber);
        if (answer) {
          await ctx.runMutation(internal.questions.updateQuestionAnswer, {
            questionId: q._id,
            answer: answer.answer,
            keyPoints: answer.keyPoints,
            source: answer.source,
            status: "ready",
          });
          processed++;
        }
      }

      // Update assignment status
      await ctx.runMutation(internal.questions.updateAssignmentStatus, {
        assignmentId: args.assignmentId,
        status: "ready",
      });

      return { success: true, processed };
    } catch (error) {
      console.error("Answer generation error:", error);

      await ctx.runMutation(internal.questions.updateAssignmentStatus, {
        assignmentId: args.assignmentId,
        status: "error",
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
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
    const notesUrls = await ctx.runQuery(internal.questions.getNotesForAssignment, {
      assignmentId: question.assignmentId,
    });

    if (notesUrls.length === 0) {
      return { success: false, error: "No notes files found" };
    }

    try {
      // Prepare notes parts
      const notesParts: Part[] = await Promise.all(
        notesUrls.map(async (url: string) => {
          const { data, mimeType } = await fetchFileAsBase64(url);
          return { inlineData: { data, mimeType } };
        }),
      );

      // Get Gemini client
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
      const client = new GoogleGenAI({ apiKey });

      // Build teacher info with feedback if provided
      let teacherInfo = question.teacherInfo || "";
      if (args.feedback) {
        teacherInfo = teacherInfo
          ? `${teacherInfo}\n\nTeacher feedback for regeneration: ${args.feedback}`
          : `Teacher feedback for regeneration: ${args.feedback}`;
      }

      // Generate new answer
      const answer = await generateAnswerForQuestion(
        question.questionNumber,
        question.questionText,
        question.questionType,
        teacherInfo,
        notesParts,
        client,
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
