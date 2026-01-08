import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getCurrentUser = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("users"),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      image: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return null;
    }
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      image: user.image,
    };
  },
});

export const listNumbers = query({
  args: {
    count: v.number(),
  },
  returns: v.object({
    viewer: v.union(v.string(), v.null()),
    numbers: v.array(v.number()),
  }),
  handler: async (ctx, args) => {
    const numbers = await ctx.db
      .query("numbers")
      .order("desc")
      .take(args.count);
    const userId = await getAuthUserId(ctx);
    const user = userId === null ? null : await ctx.db.get(userId);
    return {
      viewer: user?.email ?? null,
      numbers: numbers.reverse().map((number) => number.value),
    };
  },
});

export const addNumber = mutation({
  args: {
    value: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("numbers", { value: args.value });
    return null;
  },
});

// Get user preferences
export const getUserPreferences = query({
  args: {},
  returns: v.union(
    v.object({
      defaultMetric: v.optional(
        v.union(v.literal("mean"), v.literal("median")),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    return prefs
      ? { defaultMetric: prefs.defaultMetric }
      : { defaultMetric: undefined };
  },
});

// Update user preferences
export const updateUserPreferences = mutation({
  args: {
    defaultMetric: v.optional(v.union(v.literal("mean"), v.literal("median"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { defaultMetric: args.defaultMetric });
    } else {
      await ctx.db.insert("userPreferences", {
        userId,
        defaultMetric: args.defaultMetric,
      });
    }

    return null;
  },
});
