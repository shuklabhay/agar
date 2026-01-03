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
      v.union(v.literal("notes"), v.array(v.string())), // "notes" or array of URLs
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("approved"),
    ),
  }).index("by_assignmentId", ["assignmentId"]),
});
