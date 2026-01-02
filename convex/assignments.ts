import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const MAX_TOTAL_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const validateUploadedFile = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.object({
    storageId: v.id("_storage"),
    contentType: v.string(),
    size: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const metadata = await ctx.db.system.get(args.storageId);
    if (!metadata) {
      throw new Error("File not found");
    }

    if (
      !metadata.contentType ||
      !ALLOWED_FILE_TYPES.includes(metadata.contentType)
    ) {
      await ctx.storage.delete(args.storageId);
      throw new Error(
        "Invalid file type. Only JPEG, PNG, and PDF files are allowed.",
      );
    }

    return {
      storageId: args.storageId,
      contentType: metadata.contentType,
      size: metadata.size,
    };
  },
});

export const deleteFile = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    await ctx.storage.delete(args.storageId);
    return null;
  },
});

export const createAssignment = mutation({
  args: {
    classId: v.id("classes"),
    name: v.string(),
    notes: v.array(
      v.object({
        storageId: v.id("_storage"),
        fileName: v.string(),
        contentType: v.string(),
      }),
    ),
  },
  returns: v.id("assignments"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Verify the class belongs to the user
    const classDoc = await ctx.db.get(args.classId);
    if (!classDoc || classDoc.teacherId !== userId) {
      throw new Error("Class not found or access denied");
    }

    // Server-side validation of total file size
    let totalSize = 0;
    for (const note of args.notes) {
      const metadata = await ctx.db.system.get(note.storageId);
      if (metadata) {
        totalSize += metadata.size;
      }
    }

    if (totalSize > MAX_TOTAL_SIZE_BYTES) {
      throw new Error(
        `Total file size exceeds 15MB limit. Current total: ${(totalSize / (1024 * 1024)).toFixed(1)}MB`,
      );
    }

    const assignmentId = await ctx.db.insert("assignments", {
      name: args.name,
      classId: args.classId,
      notes: args.notes,
    });

    return assignmentId;
  },
});

export const getAssignment = query({
  args: { assignmentId: v.id("assignments") },
  returns: v.union(
    v.object({
      _id: v.id("assignments"),
      _creationTime: v.number(),
      name: v.string(),
      classId: v.id("classes"),
      notes: v.array(
        v.object({
          storageId: v.id("_storage"),
          fileName: v.string(),
          contentType: v.string(),
          url: v.union(v.string(), v.null()),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      return null;
    }

    // Verify the class belongs to the user
    const classDoc = await ctx.db.get(assignment.classId);
    if (!classDoc || classDoc.teacherId !== userId) {
      return null;
    }

    // Get URLs for all notes
    const notesWithUrls = await Promise.all(
      assignment.notes.map(async (note) => ({
        ...note,
        url: await ctx.storage.getUrl(note.storageId),
      })),
    );

    return {
      ...assignment,
      notes: notesWithUrls,
    };
  },
});

export const listAssignments = query({
  args: { classId: v.id("classes") },
  returns: v.array(
    v.object({
      _id: v.id("assignments"),
      _creationTime: v.number(),
      name: v.string(),
      classId: v.id("classes"),
      notesCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    // Verify the class belongs to the user
    const classDoc = await ctx.db.get(args.classId);
    if (!classDoc || classDoc.teacherId !== userId) {
      return [];
    }

    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_classId", (q) => q.eq("classId", args.classId))
      .collect();

    return assignments.map((assignment) => ({
      _id: assignment._id,
      _creationTime: assignment._creationTime,
      name: assignment.name,
      classId: assignment.classId,
      notesCount: assignment.notes.length,
    }));
  },
});
