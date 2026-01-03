import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// PUBLIC: Get assignment info for student (no auth required)
export const getAssignmentForStudent = query({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment || assignment.isDraft) return null;

    // Only return if processing is complete and has approved questions
    if (assignment.processingStatus !== "ready") return null;

    // Check if there are any approved questions
    const approvedQuestions = await ctx.db
      .query("questions")
      .withIndex("by_assignmentId", (q) => q.eq("assignmentId", args.assignmentId))
      .filter((q) => q.eq(q.field("status"), "approved"))
      .first();

    if (!approvedQuestions) return null;

    // Get class name for display
    const classDoc = await ctx.db.get(assignment.classId);

    return {
      _id: assignment._id,
      name: assignment.name,
      className: classDoc?.name ?? "Unknown Class",
    };
  },
});

// PUBLIC: Get list of existing students for this assignment (for "continue as" selection)
export const getExistingStudents = query({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("studentSessions")
      .withIndex("by_assignmentId", (q) => q.eq("assignmentId", args.assignmentId))
      .collect();

    // Return basic info for selection (sorted by most recent activity)
    return sessions
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
      .map((s) => ({
        _id: s._id,
        name: s.name,
        lastActiveAt: s.lastActiveAt,
      }));
  },
});

// PUBLIC: Start a new session
export const startSession = mutation({
  args: {
    assignmentId: v.id("assignments"),
    studentName: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify assignment exists and is ready
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment || assignment.isDraft || assignment.processingStatus !== "ready") {
      throw new Error("Assignment not available");
    }

    // Create new session with UUID token
    const sessionToken = crypto.randomUUID();
    const now = Date.now();

    const sessionId = await ctx.db.insert("studentSessions", {
      name: args.studentName.trim(),
      sessionToken,
      assignmentId: args.assignmentId,
      startedAt: now,
      lastActiveAt: now,
    });

    return { sessionId, sessionToken };
  },
});

// PUBLIC: Resume an existing session (for returning students)
export const resumeSession = mutation({
  args: {
    sessionId: v.id("studentSessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    // Generate new token and update last active
    const sessionToken = crypto.randomUUID();
    await ctx.db.patch(args.sessionId, {
      sessionToken,
      lastActiveAt: Date.now(),
    });

    return { sessionId: args.sessionId, sessionToken };
  },
});

// PUBLIC: Get session by token (to verify cookie)
export const getSession = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("studentSessions")
      .withIndex("by_sessionToken", (q) => q.eq("sessionToken", args.sessionToken))
      .first();

    return session;
  },
});

// PUBLIC: Update session activity (called periodically)
export const updateSessionActivity = mutation({
  args: { sessionId: v.id("studentSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    await ctx.db.patch(args.sessionId, {
      lastActiveAt: Date.now(),
    });
  },
});
