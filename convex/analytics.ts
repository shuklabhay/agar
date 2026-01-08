import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Doc, Id } from "./_generated/dataModel";

function calculateStats(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  const percentile = (p: number) => {
    const index = (p / 100) * (n - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    return sorted[lower] * (upper - index) + sorted[upper] * (index - lower);
  };

  return {
    min: sorted[0],
    max: sorted[n - 1],
    mean: values.reduce((a, b) => a + b, 0) / n,
    median: percentile(50),
    q1: percentile(25),
    q3: percentile(75),
  };
}

// Helper: Calculate understanding level based on completion and messages
function getUnderstandingLevel(
  completionRate: number,
  avgMessages: number,
): "low" | "medium" | "high" {
  // High: completed most questions with few messages needed
  if (completionRate >= 0.8 && avgMessages <= 5) return "high";
  // Medium: decent completion or not too many messages
  if (completionRate >= 0.5 || avgMessages <= 10) return "medium";
  return "low";
}

function getTrackedSessions<T extends { sessionMode?: string }>(
  sessions: T[],
): T[] {
  return sessions.filter((s) => s.sessionMode !== "teacher_preview");
}

type ProgressBySession = Map<Id<"studentSessions">, Doc<"studentProgress">[]>;
type MessagesBySession = Map<Id<"studentSessions">, Doc<"chatMessages">[]>;

async function loadProgressBySession(
  ctx: QueryCtx,
  assignmentId: Id<"assignments">,
  sessionIds: Id<"studentSessions">[],
): Promise<ProgressBySession> {
  const progressBySession: ProgressBySession = new Map();
  sessionIds.forEach((id) => progressBySession.set(id, []));
  if (sessionIds.length === 0) return progressBySession;

  const progressForAssignment = await ctx.db
    .query("studentProgress")
    .withIndex("by_assignmentId", (q) => q.eq("assignmentId", assignmentId))
    .collect();

  for (const progress of progressForAssignment) {
    const list = progressBySession.get(progress.sessionId);
    if (list) {
      list.push(progress);
    }
  }

  // Fallback for older rows without assignmentId denorm
  const missingSessions = sessionIds.filter(
    (id) => (progressBySession.get(id)?.length ?? 0) === 0,
  );
  for (const sessionId of missingSessions) {
    const progress = await ctx.db
      .query("studentProgress")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .collect();
    progressBySession.set(sessionId, progress);
  }

  return progressBySession;
}

async function loadStudentMessagesBySession(
  ctx: QueryCtx,
  assignmentId: Id<"assignments">,
  sessionIds: Id<"studentSessions">[],
): Promise<MessagesBySession> {
  const messagesBySession: MessagesBySession = new Map();
  sessionIds.forEach((id) => messagesBySession.set(id, []));
  if (sessionIds.length === 0) return messagesBySession;

  const messagesForAssignment = await ctx.db
    .query("chatMessages")
    .withIndex("by_assignmentId", (q) => q.eq("assignmentId", assignmentId))
    .filter((q) => q.eq(q.field("role"), "student"))
    .collect();

  for (const msg of messagesForAssignment) {
    const list = messagesBySession.get(msg.sessionId);
    if (list) {
      list.push(msg);
    }
  }

  // Fallback for messages missing assignmentId
  const missingSessions = sessionIds.filter(
    (id) => (messagesBySession.get(id)?.length ?? 0) === 0,
  );
  for (const sessionId of missingSessions) {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .filter((q) => q.eq(q.field("role"), "student"))
      .collect();
    messagesBySession.set(sessionId, messages);
  }

  return messagesBySession;
}

// Get overall class analytics across all assignments
export const getClassAnalytics = query({
  args: { classId: v.id("classes") },
  handler: async (ctx, args) => {
    // Verify teacher owns this class
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const classData = await ctx.db.get(args.classId);
    if (!classData || classData.teacherId !== userId) return null;

    // Get all non-draft assignments for this class
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_classId", (q) => q.eq("classId", args.classId))
      .collect();

    const publishedAssignments = assignments.filter((a) => !a.isDraft);

    if (publishedAssignments.length === 0) {
      return {
        totalStudents: 0,
        totalQuestionsCompleted: 0,
        overallCompletionRate: 0,
        avgMessagesPerQuestion: 0,
        medianMessages: 0,
        avgTimePerQuestionMs: 0,
        assignmentStats: [],
        allMessagesBoxPlot: null,
        allTimesBoxPlot: null,
        hasData: false,
      };
    }

    // Collect all student data across assignments
    const allMessages: number[] = []; // messages per question
    const allTimes: number[] = [];
    const studentCompletionRates: number[] = []; // completion rate per student
    let totalQuestionsCompleted = 0;
    const uniqueStudents = new Set<string>();

    const assignmentStats: {
      assignmentId: Id<"assignments">;
      assignmentName: string;
      studentCount: number;
      completionRate: number;
      questionCount: number;
    }[] = [];

    for (const assignment of publishedAssignments) {
      // Get questions for this assignment
      const questions = await ctx.db
        .query("questions")
        .withIndex("by_assignmentId", (q) =>
          q.eq("assignmentId", assignment._id),
        )
        .filter((q) => q.eq(q.field("status"), "approved"))
        .collect();

      const validQuestions = questions.filter(
        (q) => q.questionType !== "skipped",
      );
      const questionCount = validQuestions.length;
      const questionIds = new Set(validQuestions.map((q) => q._id));

      // Get all sessions for this assignment
      const sessions = await ctx.db
        .query("studentSessions")
        .withIndex("by_assignmentId", (q) =>
          q.eq("assignmentId", assignment._id),
        )
        .collect();

      const trackedSessions = getTrackedSessions(sessions);
      const sessionIds = trackedSessions.map((s) => s._id);
      const progressBySession = await loadProgressBySession(
        ctx,
        assignment._id,
        sessionIds,
      );
      const messagesBySession = await loadStudentMessagesBySession(
        ctx,
        assignment._id,
        sessionIds,
      );
      const assignmentStudentCompletionRates: number[] = [];

      for (const session of trackedSessions) {
        uniqueStudents.add(session.name);

        // Get progress for this session
        const progress = progressBySession.get(session._id) ?? [];

        // Get chat messages for this session
        const chatMessages = messagesBySession.get(session._id) ?? [];

        // Count messages per question
        const messagesByQuestion = new Map<string, number>();
        for (const msg of chatMessages) {
          if (msg.role === "student") {
            const count = messagesByQuestion.get(msg.questionId) ?? 0;
            messagesByQuestion.set(msg.questionId, count + 1);
          }
        }

        let studentQuestionsCorrect = 0;
        for (const p of progress) {
          if (!questionIds.has(p.questionId)) continue;

          if (p.status === "correct") {
            studentQuestionsCorrect++;
            totalQuestionsCompleted++;
          }

          // Get message count for this question
          const msgCount = messagesByQuestion.get(p.questionId) ?? 0;
          if (msgCount > 0) {
            allMessages.push(msgCount);
          }

          if (p.timeSpentMs && p.timeSpentMs > 0) {
            allTimes.push(p.timeSpentMs);
          }
        }

        // Calculate this student's completion rate for this assignment
        const studentCompletionRate =
          questionCount > 0 ? studentQuestionsCorrect / questionCount : 0;
        studentCompletionRates.push(studentCompletionRate);
        assignmentStudentCompletionRates.push(studentCompletionRate);
      }

      // Assignment completion rate = average of all students' completion rates
      const avgAssignmentCompletion =
        assignmentStudentCompletionRates.length > 0
          ? assignmentStudentCompletionRates.reduce((a, b) => a + b, 0) /
            assignmentStudentCompletionRates.length
          : 0;

      assignmentStats.push({
        assignmentId: assignment._id,
        assignmentName: assignment.name,
        studentCount: trackedSessions.length,
        completionRate: avgAssignmentCompletion,
        questionCount,
      });
    }

    const messageStats = calculateStats(allMessages);
    const timeStats = calculateStats(allTimes);

    // Overall completion rate = average of all students' completion rates
    const overallCompletionRate =
      studentCompletionRates.length > 0
        ? studentCompletionRates.reduce((a, b) => a + b, 0) /
          studentCompletionRates.length
        : 0;

    return {
      totalStudents: uniqueStudents.size,
      totalQuestionsCompleted,
      overallCompletionRate,
      avgMessagesPerQuestion: messageStats?.mean ?? 0,
      medianMessages: messageStats?.median ?? 0,
      avgTimePerQuestionMs: timeStats?.mean ?? 0,
      assignmentStats,
      allMessagesBoxPlot: messageStats,
      allTimesBoxPlot: timeStats,
      hasData: allMessages.length > 0 || totalQuestionsCompleted > 0,
    };
  },
});

// Get detailed analytics for a specific assignment
export const getAssignmentAnalytics = query({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, args) => {
    // Verify teacher owns this assignment
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) return null;

    const classData = await ctx.db.get(assignment.classId);
    if (!classData || classData.teacherId !== userId) return null;

    // Get questions
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_assignmentId", (q) =>
        q.eq("assignmentId", args.assignmentId),
      )
      .filter((q) => q.eq(q.field("status"), "approved"))
      .collect();

    const validQuestions = questions
      .filter((q) => q.questionType !== "skipped")
      .sort((a, b) => a.extractionOrder - b.extractionOrder);

    // Get all sessions
    const sessions = await ctx.db
      .query("studentSessions")
      .withIndex("by_assignmentId", (q) =>
        q.eq("assignmentId", args.assignmentId),
      )
      .collect();

    const trackedSessions = getTrackedSessions(sessions);

    if (trackedSessions.length === 0) {
      return {
        assignmentId: args.assignmentId,
        assignmentName: assignment.name,
        totalStudents: 0,
        totalQuestions: validQuestions.length,
        completionRate: 0,
        messagesBoxPlot: null,
        timeBoxPlot: null,
        questionStats: [],
        hasData: false,
      };
    }

    // Collect per-question stats
    const questionStatsMap = new Map<
      string,
      {
        messages: number[];
        times: number[];
        correct: number;
        studentsWithProgress: number;
      }
    >();

    for (const q of validQuestions) {
      questionStatsMap.set(q._id, {
        messages: [],
        times: [],
        correct: 0,
        studentsWithProgress: 0,
      });
    }

    const allMessages: number[] = [];
    const allTimes: number[] = [];
    const studentCompletionRates: number[] = [];

    const sessionIds = trackedSessions.map((s) => s._id);
    const progressBySession = await loadProgressBySession(
      ctx,
      args.assignmentId,
      sessionIds,
    );
    const messagesBySession = await loadStudentMessagesBySession(
      ctx,
      args.assignmentId,
      sessionIds,
    );

    for (const session of trackedSessions) {
      const progress = progressBySession.get(session._id) ?? [];

      // Get chat messages for this session
      const chatMessages = messagesBySession.get(session._id) ?? [];

      // Count student messages per question
      const messagesByQuestion = new Map<string, number>();
      for (const msg of chatMessages) {
        if (msg.role === "student") {
          const count = messagesByQuestion.get(msg.questionId) ?? 0;
          messagesByQuestion.set(msg.questionId, count + 1);
        }
      }

      let studentCorrect = 0;
      for (const p of progress) {
        const qStats = questionStatsMap.get(p.questionId);
        if (!qStats) continue;

        qStats.studentsWithProgress++;
        const msgCount = messagesByQuestion.get(p.questionId) ?? 0;
        if (msgCount > 0) {
          qStats.messages.push(msgCount);
          allMessages.push(msgCount);
        }

        if (p.timeSpentMs && p.timeSpentMs > 0) {
          qStats.times.push(p.timeSpentMs);
          allTimes.push(p.timeSpentMs);
        }

        if (p.status === "correct") {
          qStats.correct++;
          studentCorrect++;
        }
      }

      // Student's completion rate
      studentCompletionRates.push(
        validQuestions.length > 0 ? studentCorrect / validQuestions.length : 0,
      );
    }

    // Build question stats array
    const questionStats = validQuestions.map((q) => {
      const stats = questionStatsMap.get(q._id)!;
      const messageStats = calculateStats(stats.messages);
      const timeStats = calculateStats(stats.times);
      const successRate =
        stats.studentsWithProgress > 0
          ? stats.correct / stats.studentsWithProgress
          : 0;
      const avgMessages = messageStats?.mean ?? 0;

      return {
        questionId: q._id,
        questionNumber: q.questionNumber,
        questionText:
          q.questionText.length > 80
            ? q.questionText.slice(0, 80) + "..."
            : q.questionText,
        questionType: q.questionType,
        successRate,
        avgMessages,
        medianMessages: messageStats?.median ?? 0,
        avgTimeMs: timeStats?.mean ?? 0,
        studentsAttempted: stats.studentsWithProgress,
        // Struggle score: low success + many messages = harder
        struggleScore: (1 - successRate) * Math.max(avgMessages, 1),
      };
    });

    // Sort by struggle score for identifying difficult questions
    const struggleQuestions = [...questionStats]
      .sort((a, b) => b.struggleScore - a.struggleScore)
      .slice(0, 5)
      .map((q) => q.questionId);

    // Overall completion rate for this assignment
    const completionRate =
      studentCompletionRates.length > 0
        ? studentCompletionRates.reduce((a, b) => a + b, 0) /
          studentCompletionRates.length
        : 0;

    return {
      assignmentId: args.assignmentId,
      assignmentName: assignment.name,
      totalStudents: trackedSessions.length,
      totalQuestions: validQuestions.length,
      completionRate,
      messagesBoxPlot: calculateStats(allMessages),
      timeBoxPlot: calculateStats(allTimes),
      questionStats,
      struggleQuestions,
      hasData: allMessages.length > 0 || studentCompletionRates.length > 0,
    };
  },
});

// Get per-student performance for an assignment
export const getStudentPerformance = query({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, args) => {
    // Verify teacher owns this assignment
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) return null;

    const classData = await ctx.db.get(assignment.classId);
    if (!classData || classData.teacherId !== userId) return null;

    // Get questions count
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_assignmentId", (q) =>
        q.eq("assignmentId", args.assignmentId),
      )
      .filter((q) => q.eq(q.field("status"), "approved"))
      .collect();

    const validQuestions = questions.filter(
      (q) => q.questionType !== "skipped",
    );
    const totalQuestions = validQuestions.length;
    const questionIds = new Set(validQuestions.map((q) => q._id));

    // Get all sessions
    const sessions = await ctx.db
      .query("studentSessions")
      .withIndex("by_assignmentId", (q) =>
        q.eq("assignmentId", args.assignmentId),
      )
      .collect();

    const trackedSessions = getTrackedSessions(sessions);
    const studentRecords = [];
    const sessionIds = trackedSessions.map((s) => s._id);
    const progressBySession = await loadProgressBySession(
      ctx,
      args.assignmentId,
      sessionIds,
    );
    const messagesBySession = await loadStudentMessagesBySession(
      ctx,
      args.assignmentId,
      sessionIds,
    );

    for (const session of trackedSessions) {
      const progress = progressBySession.get(session._id) ?? [];

      // Get chat messages for this session
      const chatMessages = messagesBySession.get(session._id) ?? [];

      // Count student messages
      const totalMessages = chatMessages.filter(
        (m) => m.role === "student",
      ).length;

      // Count questions with messages
      const questionsWithMessages = new Set(
        chatMessages
          .filter((m) => m.role === "student")
          .map((m) => m.questionId),
      ).size;

      let questionsCompleted = 0;
      let totalTimeMs = 0;

      for (const p of progress) {
        if (!questionIds.has(p.questionId)) continue;

        if (p.status === "correct") {
          questionsCompleted++;
        }
        if (p.timeSpentMs && p.timeSpentMs > 0) {
          totalTimeMs += p.timeSpentMs;
        }
      }

      const completionRate =
        totalQuestions > 0 ? questionsCompleted / totalQuestions : 0;
      const avgMessages =
        questionsWithMessages > 0 ? totalMessages / questionsWithMessages : 0;

      studentRecords.push({
        sessionId: session._id,
        name: session.name,
        startedAt: session.startedAt,
        lastActiveAt: session.lastActiveAt,
        questionsCompleted,
        totalQuestions,
        completionRate,
        totalMessages,
        avgMessages,
        totalTimeMs,
        understandingLevel: getUnderstandingLevel(completionRate, avgMessages),
      });
    }

    // Sort by last active (most recent first)
    studentRecords.sort((a, b) => b.lastActiveAt - a.lastActiveAt);

    return studentRecords;
  },
});

// Get box plot data comparing all assignments in a class
export const getAssignmentComparisonBoxPlots = query({
  args: { classId: v.id("classes") },
  handler: async (ctx, args) => {
    // Verify teacher owns this class
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const classData = await ctx.db.get(args.classId);
    if (!classData || classData.teacherId !== userId) return null;

    // Get all non-draft assignments
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_classId", (q) => q.eq("classId", args.classId))
      .collect();

    const publishedAssignments = assignments.filter((a) => !a.isDraft);

    const assignmentBoxPlots: {
      assignmentId: Id<"assignments">;
      assignmentName: string;
      messagesBoxPlot: ReturnType<typeof calculateStats>;
      timeBoxPlot: ReturnType<typeof calculateStats>;
    }[] = [];

    for (const assignment of publishedAssignments) {
      const sessions = await ctx.db
        .query("studentSessions")
        .withIndex("by_assignmentId", (q) =>
          q.eq("assignmentId", assignment._id),
        )
        .collect();

      const trackedSessions = getTrackedSessions(sessions);
      const allMessages: number[] = [];
      const allTimes: number[] = [];
      const sessionIds = trackedSessions.map((s) => s._id);
      const progressBySession = await loadProgressBySession(
        ctx,
        assignment._id,
        sessionIds,
      );
      const messagesBySession = await loadStudentMessagesBySession(
        ctx,
        assignment._id,
        sessionIds,
      );

      for (const session of trackedSessions) {
        const progress = progressBySession.get(session._id) ?? [];

        // Get chat messages for this session
        const chatMessages = messagesBySession.get(session._id) ?? [];

        // Count messages per question
        const messagesByQuestion = new Map<string, number>();
        for (const msg of chatMessages) {
          if (msg.role === "student") {
            const count = messagesByQuestion.get(msg.questionId) ?? 0;
            messagesByQuestion.set(msg.questionId, count + 1);
          }
        }

        for (const p of progress) {
          const msgCount = messagesByQuestion.get(p.questionId) ?? 0;
          if (msgCount > 0) {
            allMessages.push(msgCount);
          }
          if (p.timeSpentMs && p.timeSpentMs > 0) {
            allTimes.push(p.timeSpentMs);
          }
        }
      }

      if (allMessages.length > 0 || allTimes.length > 0) {
        assignmentBoxPlots.push({
          assignmentId: assignment._id,
          assignmentName: assignment.name,
          messagesBoxPlot: calculateStats(allMessages),
          timeBoxPlot: calculateStats(allTimes),
        });
      }
    }

    return assignmentBoxPlots;
  },
});

// Get box plot data per question for an assignment
export const getQuestionBoxPlots = query({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, args) => {
    // Verify teacher owns this assignment
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) return null;

    const classData = await ctx.db.get(assignment.classId);
    if (!classData || classData.teacherId !== userId) return null;

    // Get questions
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_assignmentId", (q) =>
        q.eq("assignmentId", args.assignmentId),
      )
      .filter((q) => q.eq(q.field("status"), "approved"))
      .collect();

    const validQuestions = questions
      .filter((q) => q.questionType !== "skipped")
      .sort((a, b) => a.extractionOrder - b.extractionOrder);

    // Get all sessions
    const sessions = await ctx.db
      .query("studentSessions")
      .withIndex("by_assignmentId", (q) =>
        q.eq("assignmentId", args.assignmentId),
      )
      .collect();

    const trackedSessions = getTrackedSessions(sessions);
    const sessionIds = trackedSessions.map((s) => s._id);
    const progressBySession = await loadProgressBySession(
      ctx,
      args.assignmentId,
      sessionIds,
    );
    const messagesBySession = await loadStudentMessagesBySession(
      ctx,
      args.assignmentId,
      sessionIds,
    );

    // Collect per-question data
    const questionDataMap = new Map<
      string,
      { messages: number[]; times: number[] }
    >();
    for (const q of validQuestions) {
      questionDataMap.set(q._id, { messages: [], times: [] });
    }

    for (const session of trackedSessions) {
      const progress = progressBySession.get(session._id) ?? [];

      // Get chat messages for this session
      const chatMessages = messagesBySession.get(session._id) ?? [];

      // Count messages per question
      const messagesByQuestion = new Map<string, number>();
      for (const msg of chatMessages) {
        if (msg.role === "student") {
          const count = messagesByQuestion.get(msg.questionId) ?? 0;
          messagesByQuestion.set(msg.questionId, count + 1);
        }
      }

      for (const p of progress) {
        const qData = questionDataMap.get(p.questionId);
        if (!qData) continue;

        const msgCount = messagesByQuestion.get(p.questionId) ?? 0;
        if (msgCount > 0) {
          qData.messages.push(msgCount);
        }
        if (p.timeSpentMs && p.timeSpentMs > 0) {
          qData.times.push(p.timeSpentMs);
        }
      }
    }

    const questionBoxPlots = validQuestions.map((q) => {
      const data = questionDataMap.get(q._id)!;
      return {
        questionId: q._id,
        questionNumber: q.questionNumber,
        questionText:
          q.questionText.length > 50
            ? q.questionText.slice(0, 50) + "..."
            : q.questionText,
        messagesBoxPlot: calculateStats(data.messages),
        timeBoxPlot: calculateStats(data.times),
      };
    });

    return questionBoxPlots;
  },
});

// Get all students across all assignments for a class
export const getAllStudentsInClass = query({
  args: { classId: v.id("classes") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const classData = await ctx.db.get(args.classId);
    if (!classData || classData.teacherId !== userId) return [];

    // Get all assignments for this class
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_classId", (q) => q.eq("classId", args.classId))
      .collect();

    const publishedAssignments = assignments.filter((a) => !a.isDraft);

    // Build a map of student name -> assignment performances
    const studentMap = new Map<
      string,
      {
        name: string;
        assignments: Array<{
          assignmentId: Id<"assignments">;
          assignmentName: string;
          sessionId: Id<"studentSessions">;
          questionsCompleted: number;
          totalQuestions: number;
          completionRate: number;
          avgMessages: number;
          totalTimeMs: number;
          lastActiveAt: number;
        }>;
        totalQuestionsCompleted: number;
        totalQuestions: number;
        overallCompletionRate: number;
        overallAvgMessages: number;
        totalMessageCount: number;
        lastActiveAt: number;
      }
    >();

    for (const assignment of publishedAssignments) {
      // Get questions count
      const questions = await ctx.db
        .query("questions")
        .withIndex("by_assignmentId", (q) =>
          q.eq("assignmentId", assignment._id),
        )
        .filter((q) => q.eq(q.field("status"), "approved"))
        .collect();
      const totalQuestions = questions.length;
      if (totalQuestions === 0) continue;

      // Get all sessions for this assignment
      const sessions = await ctx.db
        .query("studentSessions")
        .withIndex("by_assignmentId", (q) =>
          q.eq("assignmentId", assignment._id),
        )
        .collect();

      const trackedSessions = getTrackedSessions(sessions);
      const sessionIds = trackedSessions.map((s) => s._id);
      const progressBySession = await loadProgressBySession(
        ctx,
        assignment._id,
        sessionIds,
      );
      const messagesBySession = await loadStudentMessagesBySession(
        ctx,
        assignment._id,
        sessionIds,
      );

      for (const session of trackedSessions) {
        // Get progress
        const progress = progressBySession.get(session._id) ?? [];

        // Get messages
        const messages = messagesBySession.get(session._id) ?? [];

        const questionsCompleted = progress.filter(
          (p) => p.status === "correct",
        ).length;
        const totalTimeMs = progress.reduce(
          (sum, p) => sum + (p.timeSpentMs ?? 0),
          0,
        );
        const avgMessages =
          progress.length > 0 ? messages.length / progress.length : 0;

        const assignmentPerf = {
          assignmentId: assignment._id,
          assignmentName: assignment.name,
          sessionId: session._id,
          questionsCompleted,
          totalQuestions,
          completionRate:
            totalQuestions > 0 ? questionsCompleted / totalQuestions : 0,
          avgMessages,
          totalTimeMs,
          lastActiveAt: session.lastActiveAt,
        };

        const existing = studentMap.get(session.name);
        if (existing) {
          existing.assignments.push(assignmentPerf);
          existing.totalQuestionsCompleted += questionsCompleted;
          existing.totalQuestions += totalQuestions;
          existing.overallCompletionRate =
            existing.totalQuestions > 0
              ? existing.totalQuestionsCompleted / existing.totalQuestions
              : 0;
          existing.totalMessageCount += messages.length;
          existing.overallAvgMessages =
            existing.totalQuestions > 0
              ? existing.totalMessageCount / existing.totalQuestions
              : 0;
          existing.lastActiveAt = Math.max(
            existing.lastActiveAt,
            session.lastActiveAt,
          );
        } else {
          studentMap.set(session.name, {
            name: session.name,
            assignments: [assignmentPerf],
            totalQuestionsCompleted: questionsCompleted,
            totalQuestions,
            overallCompletionRate:
              totalQuestions > 0 ? questionsCompleted / totalQuestions : 0,
            totalMessageCount: messages.length,
            overallAvgMessages:
              totalQuestions > 0 ? messages.length / totalQuestions : 0,
            lastActiveAt: session.lastActiveAt,
          });
        }
      }
    }

    // Convert to array and sort by last active
    const students = Array.from(studentMap.values()).sort(
      (a, b) => b.lastActiveAt - a.lastActiveAt,
    );

    return students;
  },
});

// Get per-question details for a specific student session
export const getStudentQuestionDetails = query({
  args: { sessionId: v.id("studentSessions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    // Get session and verify teacher access
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.sessionMode === "teacher_preview") return [];

    const assignment = await ctx.db.get(session.assignmentId);
    if (!assignment) return [];

    const classData = await ctx.db.get(assignment.classId);
    if (!classData || classData.teacherId !== userId) return [];

    // Get questions for this assignment
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_assignmentId", (q) =>
        q.eq("assignmentId", session.assignmentId),
      )
      .filter((q) => q.eq(q.field("status"), "approved"))
      .collect();

    // Get progress for this session
    const progress = await ctx.db
      .query("studentProgress")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    // Get messages for this session grouped by question
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("role"), "student"))
      .collect();

    const messagesByQuestion = new Map<string, number>();
    for (const msg of messages) {
      const count = messagesByQuestion.get(msg.questionId) ?? 0;
      messagesByQuestion.set(msg.questionId, count + 1);
    }

    // Build result
    const result = questions
      .sort((a, b) => a.extractionOrder - b.extractionOrder)
      .map((q) => {
        const p = progress.find((pr) => pr.questionId === q._id);
        return {
          questionId: q._id,
          questionNumber: q.questionNumber,
          questionText: q.questionText,
          status: p?.status ?? "not_started",
          messageCount: messagesByQuestion.get(q._id) ?? 0,
          timeSpentMs: p?.timeSpentMs ?? 0,
        };
      });

    return result;
  },
});
