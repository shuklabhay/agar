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
    notes: v.array(
      v.object({
        storageId: v.id("_storage"),
        fileName: v.string(),
        contentType: v.string(),
      }),
    ),
  }).index("by_classId", ["classId"]),
});
