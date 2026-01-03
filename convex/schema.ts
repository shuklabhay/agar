import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  numbers: defineTable({
    value: v.number(),
  }),
  classes: defineTable({
    name: v.string(),
    section: v.optional(v.string()),
    teacherId: v.id("users"),
    preferences: v.optional(
      v.object({
        defaultMetric: v.optional(v.union(v.literal("mean"), v.literal("median"))),
      })
    ),
  }).index("by_teacherId", ["teacherId"]),
  assignments: defineTable({
    name: v.string(),
    classId: v.id("classes"),
    assignmentFiles: v.array(
      v.object({
        storageId: v.id("_storage"),
        fileName: v.string(),
        contentType: v.string(),
        size: v.optional(v.number()),
      }),
    ),
    notesFiles: v.array(
      v.object({
        storageId: v.id("_storage"),
        fileName: v.string(),
        contentType: v.string(),
        size: v.optional(v.number()),
      }),
    ),
    additionalInfo: v.optional(v.string()),
    isDraft: v.optional(v.boolean()),
    processingStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("extracting"),
        v.literal("generating_answers"),
        v.literal("ready"),
        v.literal("error"),
      ),
    ),
  }).index("by_classId", ["classId"]),
  questions: defineTable({
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
    answer: v.optional(
      v.union(
        v.string(),
        v.array(v.string()), // for free response key points
      ),
    ),
    snippets: v.optional(v.array(v.string())),
    source: v.optional(
      v.union(v.literal("notes"), v.array(v.string())),
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("approved"),
    ),
  }).index("by_assignmentId", ["assignmentId"]),

  // Student session (cookie-based identity, no accounts)
  studentSessions: defineTable({
    name: v.string(),
    sessionToken: v.string(), // UUID stored in cookie
    assignmentId: v.id("assignments"),
    startedAt: v.number(),
    lastActiveAt: v.number(),
    lastQuestionIndex: v.optional(v.number()),
  })
    .index("by_sessionToken", ["sessionToken"])
    .index("by_assignmentId", ["assignmentId"]),

  // Per-question progress tracking
  studentProgress: defineTable({
    sessionId: v.id("studentSessions"),
    questionId: v.id("questions"),
    status: v.union(
      v.literal("not_started"),
      v.literal("in_progress"),
      v.literal("correct"),
      v.literal("incorrect"),
    ),
    selectedAnswer: v.optional(v.string()),
    submittedText: v.optional(v.string()),
    attempts: v.number(),
    completedAt: v.optional(v.number()),
    // Time tracking
    timeSpentMs: v.optional(v.number()), // Cumulative time spent on question
    lastViewedAt: v.optional(v.number()), // When current viewing session started
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_sessionId_questionId", ["sessionId", "questionId"]),

  // Chat history for tutor conversations
  chatMessages: defineTable({
    sessionId: v.id("studentSessions"),
    questionId: v.id("questions"),
    role: v.union(
      v.literal("student"),
      v.literal("tutor"),
      v.literal("system"),
    ),
    content: v.string(),
    timestamp: v.number(),
    toolCall: v.optional(
      v.object({
        name: v.string(),
        args: v.any(),
        result: v.optional(v.any()),
      }),
    ),
  })
    .index("by_session_question", ["sessionId", "questionId"])
    .index("by_sessionId", ["sessionId"]),

  // Student file uploads
  studentUploads: defineTable({
    sessionId: v.id("studentSessions"),
    questionId: v.id("questions"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    uploadedAt: v.number(),
  }).index("by_session_question", ["sessionId", "questionId"]),
});
