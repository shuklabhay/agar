"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { extractQuestionsFromFiles } from "./llm";

export const extractQuestions = action({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, args): Promise<{ success: boolean; count?: number; error?: string }> => {
    // Get assignment data
    const assignment = await ctx.runQuery(
      internal.questions.getAssignmentForProcessing,
      { assignmentId: args.assignmentId },
    );

    if (!assignment) {
      return { success: false, error: "Assignment not found" };
    }

    // Update status to extracting
    await ctx.runMutation(internal.questions.updateAssignmentStatus, {
      assignmentId: args.assignmentId,
      status: "extracting",
    });

    try {
      // Get file URLs
      const fileUrls = assignment.assignmentFiles
        .filter((f) => f.url)
        .map((f) => f.url!);

      // Call LLM
      const extractedQuestions = await extractQuestionsFromFiles(
        fileUrls,
        assignment.additionalInfo,
      );

      // Validate and transform
      const validTypes = [
        "multiple_choice",
        "single_number",
        "short_answer",
        "free_response",
        "skipped",
      ] as const;

      const questionsToInsert = extractedQuestions.map((q) => ({
        assignmentId: args.assignmentId,
        questionNumber: q.questionNumber,
        questionText: q.questionText,
        questionType: validTypes.includes(q.questionType as typeof validTypes[number])
          ? (q.questionType as typeof validTypes[number])
          : ("short_answer" as const),
        options: q.options,
        teacherInfo: q.teacherInfo,
        status: "pending" as const,
      }));

      // Insert questions
      await ctx.runMutation(internal.questions.insertQuestions, {
        questions: questionsToInsert,
      });

      // Update status
      await ctx.runMutation(internal.questions.updateAssignmentStatus, {
        assignmentId: args.assignmentId,
        status: "ready",
      });

      return { success: true, count: questionsToInsert.length };
    } catch (error) {
      console.error("Extraction error:", error);

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
