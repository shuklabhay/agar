// ============================================================================
// TEMPORARY: User whitelist functions for beta access
// TODO: Remove this entire file when ready for public launch
// ============================================================================

import { MutationCtx, query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

/**
 * TEMPORARY: Check if the current user is whitelisted for beta access.
 * Returns { isWhitelisted: boolean, isLoading: false } or null if not authenticated.
 *
 * Users without a whitelist entry are considered NOT whitelisted (default deny).
 */
export const isWhitelisted = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      // Not authenticated - let auth middleware handle this
      return { isWhitelisted: false, isLoading: false };
    }

    const whitelist = await ctx.db
      .query("userWhitelist")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    // If no entry exists or whitelisted is false, user is not whitelisted
    return {
      isWhitelisted: whitelist?.whitelisted ?? false,
      isLoading: false,
    };
  },
});

const setWhitelistedForUser = async (ctx: MutationCtx, userId: Id<"users">) => {
  const existing = await ctx.db
    .query("userWhitelist")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, { whitelisted: true });
  } else {
    await ctx.db.insert("userWhitelist", {
      userId,
      whitelisted: true,
    });
  }
};

/**
 * Allow a signed-in user to unlock access with a 6-letter teacher code.
 */
export const claimAccessWithCode = mutation({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const configuredCode = process.env.TEACHER_ACCESS_CODE;
    if (!configuredCode) {
      throw new Error("Access code is not set. Please contact support.");
    }

    const input = args.code.trim().toUpperCase();
    const expected = configuredCode.trim().toUpperCase();

    if (input.length !== 6) {
      throw new Error("The access code should be 6 characters.");
    }

    if (input !== expected) {
      throw new Error(
        "That code did not work. Please double-check and try again.",
      );
    }

    await setWhitelistedForUser(ctx, userId);
    return { whitelisted: true };
  },
});

/**
 * TEMPORARY: Create a whitelist entry for a user.
 * Call this from the Convex dashboard or a script to whitelist users.
 *
 * Example usage in Convex dashboard:
 *   await ctx.runMutation(api.users.setWhitelisted, {
 *     userId: "j57..." as Id<"users">,
 *     whitelisted: true
 *   });
 */
export const setWhitelisted = mutation({
  args: {
    userId: v.id("users"),
    whitelisted: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userWhitelist")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { whitelisted: args.whitelisted });
    } else {
      await ctx.db.insert("userWhitelist", {
        userId: args.userId,
        whitelisted: args.whitelisted,
      });
    }
  },
});
