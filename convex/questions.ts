import { v } from "convex/values";
import { internalMutation, internalQuery, query, mutation } from "./_generated/server";
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

// Get notes file URLs for an assignment
export const getNotesForAssignment = internalQuery({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) return [];

    const notesWithUrls = await Promise.all(
      assignment.notesFiles.map(async (file) => ({
        ...file,
        url: await ctx.storage.getUrl(file.storageId),
      })),
    );

    return notesWithUrls.filter((f) => f.url).map((f) => f.url!);
  },
});

// Get pending questions for an assignment
export const getPendingQuestions = internalQuery({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, args) => {
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_assignmentId", (q) => q.eq("assignmentId", args.assignmentId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    return questions;
  },
});

// Update a question with generated answer
export const updateQuestionAnswer = internalMutation({
  args: {
    questionId: v.id("questions"),
    answer: v.union(v.string(), v.array(v.string())),
    keyPoints: v.array(v.string()),
    source: v.union(v.literal("notes"), v.array(v.string())),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("approved"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.questionId, {
      answer: args.answer,
      keyPoints: args.keyPoints,
      source: args.source,
      status: args.status,
    });
  },
});

// Mark question as processing
export const markQuestionProcessing = internalMutation({
  args: { questionId: v.id("questions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.questionId, { status: "processing" });
  },
});

// Delete all questions for an assignment (for re-extraction)
export const deleteQuestionsForAssignment = internalMutation({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, args) => {
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_assignmentId", (q) => q.eq("assignmentId", args.assignmentId))
      .collect();

    for (const q of questions) {
      await ctx.db.delete(q._id);
    }

    return questions.length;
  },
});

// ============================================================================
// PUBLIC MUTATIONS FOR TEACHER REVIEW
// ============================================================================

// Approve a single question
export const approveQuestion = mutation({
  args: { questionId: v.id("questions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const question = await ctx.db.get(args.questionId);
    if (!question) throw new Error("Question not found");

    const assignment = await ctx.db.get(question.assignmentId);
    if (!assignment) throw new Error("Assignment not found");

    const classDoc = await ctx.db.get(assignment.classId);
    if (!classDoc || classDoc.teacherId !== userId) {
      throw new Error("Not authorized");
    }

    await ctx.db.patch(args.questionId, { status: "approved" });
  },
});

// Unapprove a single question (set back to ready)
export const unapproveQuestion = mutation({
  args: { questionId: v.id("questions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const question = await ctx.db.get(args.questionId);
    if (!question) throw new Error("Question not found");

    const assignment = await ctx.db.get(question.assignmentId);
    if (!assignment) throw new Error("Assignment not found");

    const classDoc = await ctx.db.get(assignment.classId);
    if (!classDoc || classDoc.teacherId !== userId) {
      throw new Error("Not authorized");
    }

    await ctx.db.patch(args.questionId, { status: "ready" });
  },
});

// Approve all ready questions for an assignment
export const approveAllQuestions = mutation({
  args: {
    assignmentId: v.id("assignments"),
    notesOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) throw new Error("Assignment not found");

    const classDoc = await ctx.db.get(assignment.classId);
    if (!classDoc || classDoc.teacherId !== userId) {
      throw new Error("Not authorized");
    }

    const questions = await ctx.db
      .query("questions")
      .withIndex("by_assignmentId", (q) => q.eq("assignmentId", args.assignmentId))
      .collect();

    let approved = 0;
    for (const q of questions) {
      // Approve ready questions
      if (q.status === "ready") {
        // If notesOnly is true, only approve questions with source === "notes"
        if (args.notesOnly && q.source !== "notes") {
          continue;
        }
        await ctx.db.patch(q._id, { status: "approved" });
        approved++;
      }
    }

    return { approved };
  },
});

// Edit a question's answer (teacher override)
export const editQuestionAnswer = mutation({
  args: {
    questionId: v.id("questions"),
    answer: v.union(v.string(), v.array(v.string())),
    keyPoints: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const question = await ctx.db.get(args.questionId);
    if (!question) throw new Error("Question not found");

    const assignment = await ctx.db.get(question.assignmentId);
    if (!assignment) throw new Error("Assignment not found");

    const classDoc = await ctx.db.get(assignment.classId);
    if (!classDoc || classDoc.teacherId !== userId) {
      throw new Error("Not authorized");
    }

    const update: { answer: string | string[]; keyPoints?: string[] } = {
      answer: args.answer,
    };
    if (args.keyPoints !== undefined) {
      update.keyPoints = args.keyPoints;
    }

    await ctx.db.patch(args.questionId, update);
  },
});

// Remove/delete a question
export const removeQuestion = mutation({
  args: { questionId: v.id("questions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const question = await ctx.db.get(args.questionId);
    if (!question) throw new Error("Question not found");

    const assignment = await ctx.db.get(question.assignmentId);
    if (!assignment) throw new Error("Assignment not found");

    const classDoc = await ctx.db.get(assignment.classId);
    if (!classDoc || classDoc.teacherId !== userId) {
      throw new Error("Not authorized");
    }

    await ctx.db.delete(args.questionId);
  },
});

// Get a single question by ID (for regeneration)
export const getQuestion = internalQuery({
  args: { questionId: v.id("questions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.questionId);
  },
});
