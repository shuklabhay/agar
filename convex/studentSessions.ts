import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// PUBLIC: Get assignment info for student (no auth required)
export const getAssignmentForStudent = query({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment || assignment.isDraft) return null;

    const processingStatus = assignment.processingStatus || "pending";
    const processingError = assignment.processingError;

    // Check if there are any approved questions
    const approvedQuestions = await ctx.db
      .query("questions")
      .withIndex("by_assignmentId", (q) => q.eq("assignmentId", args.assignmentId))
      .filter((q) => q.eq(q.field("status"), "approved"))
      .first();

    const isReady = processingStatus === "ready" && Boolean(approvedQuestions);

    // Get class name for display
    const classDoc = await ctx.db.get(assignment.classId);

    return {
      _id: assignment._id,
      name: assignment.name,
      className: classDoc?.name ?? "Unknown Class",
      processingStatus,
      processingError,
      isReady,
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

    const studentSessions = sessions.filter(
      (s) => s.sessionMode !== "teacher_preview",
    );

    // Return basic info for selection (sorted by most recent activity)
    return studentSessions
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
      .map((s) => ({
        _id: s._id,
        name: s.name,
        lastActiveAt: s.lastActiveAt,
      }));
  },
});

// AUTHENTICATED: Check if current user is the teacher for this assignment
export const getTeacherPreviewSession = query({
  args: { assignmentId: v.id("assignments") },
  returns: v.object({
    isTeacher: v.boolean(),
    sessionId: v.optional(v.id("studentSessions")),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { isTeacher: false };
    }

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      return { isTeacher: false };
    }

    const classDoc = await ctx.db.get(assignment.classId);
    if (!classDoc || classDoc.teacherId !== userId) {
      return { isTeacher: false };
    }

    if (assignment.isDraft || assignment.processingStatus !== "ready") {
      return { isTeacher: false };
    }

    const existing = await ctx.db
      .query("studentSessions")
      .withIndex("by_assignmentId", (q) =>
        q.eq("assignmentId", args.assignmentId),
      )
      .filter((q) => q.eq(q.field("sessionMode"), "teacher_preview"))
      .filter((q) => q.eq(q.field("userId"), userId))
      .first();

    return {
      isTeacher: true,
      sessionId: existing?._id ?? undefined,
    };
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
      sessionMode: "student",
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
    if (session.sessionMode === "teacher_preview") {
      throw new Error("Cannot resume teacher preview sessions");
    }

    // Generate new token and update last active
    const sessionToken = crypto.randomUUID();
    await ctx.db.patch(args.sessionId, {
      sessionToken,
      lastActiveAt: Date.now(),
      sessionMode: session.sessionMode ?? "student",
    });

    return { sessionId: args.sessionId, sessionToken };
  },
});

// AUTHENTICATED: Start or reuse a teacher preview session (doesn't count toward metrics)
export const startTeacherPreviewSession = mutation({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.object({
    sessionId: v.id("studentSessions"),
    sessionMode: v.literal("teacher_preview"),
  }),
  handler: async (ctx, args) => {
    const sessionMode = "teacher_preview" as const;
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const assignment = await ctx.db.get(args.assignmentId);
    if (
      !assignment ||
      assignment.isDraft ||
      assignment.processingStatus !== "ready"
    ) {
      throw new Error("Assignment not available");
    }

    const classDoc = await ctx.db.get(assignment.classId);
    if (!classDoc || classDoc.teacherId !== userId) {
      throw new Error("Access denied");
    }

    // Reuse an existing teacher preview session for this user and assignment
    const existing = await ctx.db
      .query("studentSessions")
      .withIndex("by_assignmentId", (q) =>
        q.eq("assignmentId", args.assignmentId),
      )
      .filter((q) => q.eq(q.field("sessionMode"), "teacher_preview"))
      .filter((q) => q.eq(q.field("userId"), userId))
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { lastActiveAt: now });
      return { sessionId: existing._id, sessionMode };
    }

    const user = await ctx.db.get(userId);
    const displayName =
      user?.name?.trim() ||
      user?.email?.split("@")[0] ||
      "Teacher Preview";

    const sessionToken = crypto.randomUUID();

    const sessionId = await ctx.db.insert("studentSessions", {
      name: `Teacher: ${displayName}`,
      sessionToken,
      assignmentId: args.assignmentId,
      startedAt: now,
      lastActiveAt: now,
      sessionMode,
      userId,
    });

    return { sessionId, sessionMode };
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

// PUBLIC: Update last question index (for resuming where student left off)
export const updateLastQuestionIndex = mutation({
  args: {
    sessionId: v.id("studentSessions"),
    questionIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    await ctx.db.patch(args.sessionId, {
      lastQuestionIndex: args.questionIndex,
      lastActiveAt: Date.now(),
    });
  },
});
