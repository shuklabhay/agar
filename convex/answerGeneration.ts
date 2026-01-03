"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateAnswersForQuestions } from "./llm";

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
            snippets: answer.snippets,
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
