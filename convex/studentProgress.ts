import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";

// PUBLIC: Get questions for student (only approved, without answers)
export const getQuestionsForStudent = query({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, args) => {
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_assignmentId", (q) => q.eq("assignmentId", args.assignmentId))
      .filter((q) => q.eq(q.field("status"), "approved"))
      .collect();

    // Return without answer/snippets fields (hidden from student)
    return questions
      .filter((q) => q.questionType !== "skipped")
      .map((q) => ({
        _id: q._id,
        questionNumber: q.questionNumber,
        questionText: q.questionText,
        questionType: q.questionType,
        options: q.options,
      }))
      .sort((a, b) => a.questionNumber - b.questionNumber);
  },
});

// PUBLIC: Get student progress for all questions in a session
export const getProgress = query({
  args: { sessionId: v.id("studentSessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("studentProgress")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();
  },
});

// PUBLIC: Initialize progress for a question (called when viewing)
export const initializeProgress = mutation({
  args: {
    sessionId: v.id("studentSessions"),
    questionId: v.id("questions"),
  },
  handler: async (ctx, args) => {
    // Check if already exists
    const existing = await ctx.db
      .query("studentProgress")
      .withIndex("by_sessionId_questionId", (q) =>
        q.eq("sessionId", args.sessionId).eq("questionId", args.questionId)
      )
      .first();

    if (existing) {
      // If returning to this question, start tracking time again
      if (!existing.lastViewedAt) {
        await ctx.db.patch(existing._id, { lastViewedAt: Date.now() });
      }
      return existing._id;
    }

    // Create new progress entry
    return await ctx.db.insert("studentProgress", {
      sessionId: args.sessionId,
      questionId: args.questionId,
      status: "not_started",
      attempts: 0,
      timeSpentMs: 0,
      lastViewedAt: Date.now(),
    });
  },
});

// PUBLIC: Record time spent when leaving a question
export const recordTimeSpent = mutation({
  args: {
    sessionId: v.id("studentSessions"),
    questionId: v.id("questions"),
  },
  handler: async (ctx, args) => {
    const progress = await ctx.db
      .query("studentProgress")
      .withIndex("by_sessionId_questionId", (q) =>
        q.eq("sessionId", args.sessionId).eq("questionId", args.questionId)
      )
      .first();

    if (!progress || !progress.lastViewedAt) return;

    const now = Date.now();
    const timeOnThisView = now - progress.lastViewedAt;
    const totalTime = (progress.timeSpentMs ?? 0) + timeOnThisView;

    await ctx.db.patch(progress._id, {
      timeSpentMs: totalTime,
      lastViewedAt: undefined, // Clear until they view again
    });
  },
});

// PUBLIC: Restart time tracking (when returning to the page/tab)
export const restartTimeTracking = mutation({
  args: {
    sessionId: v.id("studentSessions"),
    questionId: v.id("questions"),
  },
  handler: async (ctx, args) => {
    const progress = await ctx.db
      .query("studentProgress")
      .withIndex("by_sessionId_questionId", (q) =>
        q.eq("sessionId", args.sessionId).eq("questionId", args.questionId)
      )
      .first();

    if (progress && !progress.lastViewedAt) {
      await ctx.db.patch(progress._id, { lastViewedAt: Date.now() });
    }
  },
});

// PUBLIC: Submit answer for MCQ or single number (direct comparison)
export const submitDirectAnswer = mutation({
  args: {
    sessionId: v.id("studentSessions"),
    questionId: v.id("questions"),
    answer: v.string(),
  },
  handler: async (ctx, args) => {
    // Get the question with answer
    const question = await ctx.db.get(args.questionId);
    if (!question) throw new Error("Question not found");

    // Get progress entry
    const progress = await ctx.db
      .query("studentProgress")
      .withIndex("by_sessionId_questionId", (q) =>
        q.eq("sessionId", args.sessionId).eq("questionId", args.questionId)
      )
      .first();

    if (!progress) throw new Error("Progress not found");

    // Only allow submission for MCQ and single_number types
    if (
      question.questionType !== "multiple_choice" &&
      question.questionType !== "single_number"
    ) {
      throw new Error("Use chat for this question type");
    }

    // Normalize and compare answers
    const correctAnswer = Array.isArray(question.answer)
      ? question.answer[0]
      : question.answer;

    const studentAnswer = args.answer.trim().toLowerCase();
    const expected = (correctAnswer ?? "").toString().trim().toLowerCase();

    const isCorrect = studentAnswer === expected;

    // Update progress
    await ctx.db.patch(progress._id, {
      status: isCorrect ? "correct" : "incorrect",
      selectedAnswer: args.answer,
      attempts: progress.attempts + 1,
      completedAt: isCorrect ? Date.now() : undefined,
    });

    // Update session activity
    const session = await ctx.db.get(args.sessionId);
    if (session) {
      await ctx.db.patch(args.sessionId, { lastActiveAt: Date.now() });
    }

    return { isCorrect };
  },
});

// PUBLIC: Update progress to in_progress (when starting to work on question)
export const markInProgress = mutation({
  args: {
    sessionId: v.id("studentSessions"),
    questionId: v.id("questions"),
  },
  handler: async (ctx, args) => {
    const progress = await ctx.db
      .query("studentProgress")
      .withIndex("by_sessionId_questionId", (q) =>
        q.eq("sessionId", args.sessionId).eq("questionId", args.questionId)
      )
      .first();

    if (progress && progress.status === "not_started") {
      await ctx.db.patch(progress._id, { status: "in_progress" });
    }
  },
});

// INTERNAL: Update progress status (called by LLM actions)
export const updateProgressStatus = internalMutation({
  args: {
    progressId: v.id("studentProgress"),
    status: v.union(
      v.literal("not_started"),
      v.literal("in_progress"),
      v.literal("correct"),
      v.literal("incorrect")
    ),
    submittedText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const update: {
      status: "not_started" | "in_progress" | "correct" | "incorrect";
      submittedText?: string;
      completedAt?: number;
      attempts?: number;
    } = { status: args.status };

    if (args.submittedText !== undefined) {
      update.submittedText = args.submittedText;
    }

    if (args.status === "correct") {
      update.completedAt = Date.now();
    }

    // Increment attempts when marking correct or incorrect
    if (args.status === "correct" || args.status === "incorrect") {
      const progress = await ctx.db.get(args.progressId);
      if (progress) {
        update.attempts = progress.attempts + 1;
      }
    }

    await ctx.db.patch(args.progressId, update);
  },
});

// INTERNAL: Get progress for LLM context
export const getProgressForQuestion = query({
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
