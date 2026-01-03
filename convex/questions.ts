import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

// Internal query to get assignment with file URLs
export const getAssignmentForProcessing = internalQuery({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) return null;

    const assignmentFilesWithUrls = await Promise.all(
      assignment.assignmentFiles.map(async (file) => ({
        ...file,
        url: await ctx.storage.getUrl(file.storageId),
      })),
    );

    return {
      ...assignment,
      assignmentFiles: assignmentFilesWithUrls,
    };
  },
});

// Internal mutation to update assignment status
export const updateAssignmentStatus = internalMutation({
  args: {
    assignmentId: v.id("assignments"),
    status: v.union(
      v.literal("pending"),
      v.literal("extracting"),
      v.literal("generating_answers"),
      v.literal("ready"),
      v.literal("error"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.assignmentId, {
      processingStatus: args.status,
    });
  },
});

// Internal mutation to insert extracted questions
export const insertQuestions = internalMutation({
  args: {
    questions: v.array(
      v.object({
        assignmentId: v.id("assignments"),
        questionNumber: v.number(),
        questionText: v.string(),
        questionType: v.union(
          v.literal("multiple_choice"),
          v.literal("single_number"),
          v.literal("short_answer"),
          v.literal("free_response"),
          v.literal("skipped"),
        ),
        options: v.optional(v.array(v.string())),
        teacherInfo: v.optional(v.string()),
        status: v.union(
          v.literal("pending"),
          v.literal("processing"),
          v.literal("ready"),
          v.literal("approved"),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const ids: Id<"questions">[] = [];
    for (const q of args.questions) {
      const id = await ctx.db.insert("questions", q);
      ids.push(id);
    }
    return ids;
  },
});

// Query to get questions for an assignment (internal)
export const getQuestionsByAssignment = internalQuery({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("questions")
      .withIndex("by_assignmentId", (q) => q.eq("assignmentId", args.assignmentId))
      .collect();
  },
});

// Public query to list questions for review
export const listQuestions = query({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) return [];

    // Verify ownership through class
    const classDoc = await ctx.db.get(assignment.classId);
    if (!classDoc || classDoc.teacherId !== userId) return [];

    return await ctx.db
      .query("questions")
      .withIndex("by_assignmentId", (q) => q.eq("assignmentId", args.assignmentId))
      .collect();
  },
});
