// ============================================================================
// TEMPORARY: User whitelist functions for beta access
// TODO: Remove this entire file when ready for public launch
// ============================================================================

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

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
