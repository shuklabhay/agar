"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";

// Process assignment: extract questions then generate answers
export const processAssignment = action({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, args): Promise<{ success: boolean; questionsExtracted?: number; answersGenerated?: number; error?: string }> => {
    try {
      // Step 1: Extract questions
      const extractResult = await ctx.runAction(api.questionExtraction.extractQuestions, {
        assignmentId: args.assignmentId,
      });

      if (!extractResult.success) {
        return {
          success: false,
          error: `Extraction failed: ${extractResult.error}`,
        };
      }

      // Step 2: Generate answers
      const generateResult = await ctx.runAction(api.answerGeneration.generateAnswers, {
        assignmentId: args.assignmentId,
      });

      if (!generateResult.success) {
        return {
          success: false,
          questionsExtracted: extractResult.count,
          error: `Answer generation failed: ${generateResult.error}`,
        };
      }

      return {
        success: true,
        questionsExtracted: extractResult.count,
        answersGenerated: generateResult.processed,
      };
    } catch (error) {
      console.error("Process assignment error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // Update status to error with message
      await ctx.runMutation(internal.questions.updateAssignmentStatus, {
        assignmentId: args.assignmentId,
        status: "error",
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  },
});
