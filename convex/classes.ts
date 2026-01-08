import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

const classSchema = v.object({
  _id: v.id("classes"),
  _creationTime: v.number(),
  name: v.string(),
  section: v.optional(v.string()),
  teacherId: v.id("users"),
  preferences: v.optional(
    v.object({
      defaultMetric: v.optional(
        v.union(v.literal("mean"), v.literal("median")),
      ),
    }),
  ),
});

export const listClasses = query({
  args: {},
  returns: v.array(classSchema),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }
    const classes = await ctx.db
      .query("classes")
      .withIndex("by_teacherId", (q) => q.eq("teacherId", userId))
      .collect();
    return classes;
  },
});

export const getClass = query({
  args: { classId: v.id("classes") },
  returns: v.union(classSchema, v.null()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    const classDoc = await ctx.db.get(args.classId);
    if (!classDoc || classDoc.teacherId !== userId) {
      return null;
    }
    return classDoc;
  },
});

export const createClass = mutation({
  args: {
    name: v.string(),
    section: v.optional(v.string()),
  },
  returns: v.id("classes"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    const classId = await ctx.db.insert("classes", {
      name: args.name,
      section: args.section,
      teacherId: userId,
    });
    return classId;
  },
});

export const renameClass = mutation({
  args: {
    classId: v.id("classes"),
    name: v.string(),
    section: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const classDoc = await ctx.db.get(args.classId);
    if (!classDoc || classDoc.teacherId !== userId) {
      throw new Error("Class not found or access denied");
    }

    await ctx.db.patch(args.classId, {
      name: args.name,
      section: args.section,
    });
    return null;
  },
});

export const deleteClass = mutation({
  args: { classId: v.id("classes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const classDoc = await ctx.db.get(args.classId);
    if (!classDoc || classDoc.teacherId !== userId) {
      throw new Error("Class not found or access denied");
    }

    // Delete all assignments in this class
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_classId", (q) => q.eq("classId", args.classId))
      .collect();

    for (const assignment of assignments) {
      // Delete questions for this assignment
      const questions = await ctx.db
        .query("questions")
        .withIndex("by_assignmentId", (q) =>
          q.eq("assignmentId", assignment._id),
        )
        .collect();

      for (const question of questions) {
        await ctx.db.delete(question._id);
      }

      // Delete storage files
      for (const file of [
        ...assignment.assignmentFiles,
        ...assignment.notesFiles,
      ]) {
        await ctx.storage.delete(file.storageId);
      }

      // Delete the assignment
      await ctx.db.delete(assignment._id);
    }

    // Delete the class
    await ctx.db.delete(args.classId);

    return null;
  },
});

export const updatePreferences = mutation({
  args: {
    classId: v.id("classes"),
    preferences: v.object({
      defaultMetric: v.optional(
        v.union(v.literal("mean"), v.literal("median")),
      ),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const classDoc = await ctx.db.get(args.classId);
    if (!classDoc || classDoc.teacherId !== userId) {
      throw new Error("Class not found or access denied");
    }

    await ctx.db.patch(args.classId, { preferences: args.preferences });
    return null;
  },
});
