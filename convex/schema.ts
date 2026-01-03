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
  }).index("by_classId", ["classId"]),
});
