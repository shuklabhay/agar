import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const listClasses = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("classes"),
      _creationTime: v.number(),
      name: v.string(),
      section: v.optional(v.string()),
      teacherId: v.id("users"),
    })
  ),
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
  returns: v.union(
    v.object({
      _id: v.id("classes"),
      _creationTime: v.number(),
      name: v.string(),
      section: v.optional(v.string()),
      teacherId: v.id("users"),
    }),
    v.null()
  ),
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
