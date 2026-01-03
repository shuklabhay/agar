import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

const ALLOWED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
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
        "Invalid file type. Only JPEG, PNG, PDF, and Word documents are allowed.",
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
    draftId: v.optional(v.id("assignments")),
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
    const allFiles = [...args.assignmentFiles, ...args.notesFiles];
    for (const file of allFiles) {
      const metadata = await ctx.db.system.get(file.storageId);
      if (metadata) {
        totalSize += metadata.size;
      }
    }

    if (totalSize > MAX_TOTAL_SIZE_BYTES) {
      throw new Error(
        `Total file size exceeds 15MB limit. Current total: ${(totalSize / (1024 * 1024)).toFixed(1)}MB`,
      );
    }

    // If updating from a draft, update it instead of creating new
    if (args.draftId) {
      const draft = await ctx.db.get(args.draftId);
      if (draft && draft.isDraft) {
        await ctx.db.patch(args.draftId, {
          name: args.name,
          assignmentFiles: args.assignmentFiles,
          notesFiles: args.notesFiles,
          additionalInfo: args.additionalInfo,
          isDraft: false,
        });
        return args.draftId;
      }
    }

    const assignmentId = await ctx.db.insert("assignments", {
      name: args.name,
      classId: args.classId,
      assignmentFiles: args.assignmentFiles,
      notesFiles: args.notesFiles,
      additionalInfo: args.additionalInfo,
      isDraft: false,
    });

    return assignmentId;
  },
});

export const saveDraft = mutation({
  args: {
    classId: v.id("classes"),
    draftId: v.optional(v.id("assignments")),
    name: v.string(),
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

    // If we have an existing draft, update it
    if (args.draftId) {
      const existingDraft = await ctx.db.get(args.draftId);
      if (existingDraft && existingDraft.isDraft) {
        await ctx.db.patch(args.draftId, {
          name: args.name,
          assignmentFiles: args.assignmentFiles,
          notesFiles: args.notesFiles,
          additionalInfo: args.additionalInfo,
        });
        return args.draftId;
      }
    }

    // Create new draft
    const draftId = await ctx.db.insert("assignments", {
      name: args.name,
      classId: args.classId,
      assignmentFiles: args.assignmentFiles,
      notesFiles: args.notesFiles,
      additionalInfo: args.additionalInfo,
      isDraft: true,
    });

    return draftId;
  },
});

export const getDraft = query({
  args: { classId: v.id("classes") },
  returns: v.union(
    v.object({
      _id: v.id("assignments"),
      _creationTime: v.number(),
      name: v.string(),
      classId: v.id("classes"),
      assignmentFiles: v.array(
        v.object({
          storageId: v.id("_storage"),
          fileName: v.string(),
          contentType: v.string(),
          size: v.optional(v.number()),
          url: v.union(v.string(), v.null()),
        }),
      ),
      notesFiles: v.array(
        v.object({
          storageId: v.id("_storage"),
          fileName: v.string(),
          contentType: v.string(),
          size: v.optional(v.number()),
          url: v.union(v.string(), v.null()),
        }),
      ),
      additionalInfo: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    // Verify the class belongs to the user
    const classDoc = await ctx.db.get(args.classId);
    if (!classDoc || classDoc.teacherId !== userId) {
      return null;
    }

    // Find draft for this class
    const drafts = await ctx.db
      .query("assignments")
      .withIndex("by_classId", (q) => q.eq("classId", args.classId))
      .filter((q) => q.eq(q.field("isDraft"), true))
      .collect();

    if (drafts.length === 0) {
      return null;
    }

    const draft = drafts[0];

    // Get URLs for files
    const assignmentFilesWithUrls = await Promise.all(
      draft.assignmentFiles.map(async (file) => ({
        ...file,
        url: await ctx.storage.getUrl(file.storageId),
      })),
    );

    const notesFilesWithUrls = await Promise.all(
      draft.notesFiles.map(async (file) => ({
        ...file,
        url: await ctx.storage.getUrl(file.storageId),
      })),
    );

    return {
      _id: draft._id,
      _creationTime: draft._creationTime,
      name: draft.name,
      classId: draft.classId,
      assignmentFiles: assignmentFilesWithUrls,
      notesFiles: notesFilesWithUrls,
      additionalInfo: draft.additionalInfo,
    };
  },
});

export const deleteDraft = mutation({
  args: { draftId: v.id("assignments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const draft = await ctx.db.get(args.draftId);
    if (!draft || !draft.isDraft) {
      throw new Error("Draft not found");
    }

    // Verify the class belongs to the user
    const classDoc = await ctx.db.get(draft.classId);
    if (!classDoc || classDoc.teacherId !== userId) {
      throw new Error("Access denied");
    }

    // Delete all files
    for (const file of [...draft.assignmentFiles, ...draft.notesFiles]) {
      await ctx.storage.delete(file.storageId);
    }

    await ctx.db.delete(args.draftId);
    return null;
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
      assignmentFiles: v.array(
        v.object({
          storageId: v.id("_storage"),
          fileName: v.string(),
          contentType: v.string(),
          size: v.optional(v.number()),
          url: v.union(v.string(), v.null()),
        }),
      ),
      notesFiles: v.array(
        v.object({
          storageId: v.id("_storage"),
          fileName: v.string(),
          contentType: v.string(),
          size: v.optional(v.number()),
          url: v.union(v.string(), v.null()),
        }),
      ),
      additionalInfo: v.optional(v.string()),
      isDraft: v.optional(v.boolean()),
      processingStatus: v.optional(v.string()),
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

    // Get URLs for all assignment
    const assignmentFilesWithUrls = await Promise.all(
      assignment.assignmentFiles.map(async (file) => ({
        ...file,
        url: await ctx.storage.getUrl(file.storageId),
      })),
    );

    // Get URLs for all notes files
    const notesFilesWithUrls = await Promise.all(
      assignment.notesFiles.map(async (file) => ({
        ...file,
        url: await ctx.storage.getUrl(file.storageId),
      })),
    );

    return {
      ...assignment,
      assignmentFiles: assignmentFilesWithUrls,
      notesFiles: notesFilesWithUrls,
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
      assignmentFilesCount: v.number(),
      notesFilesCount: v.number(),
      isDraft: v.optional(v.boolean()),
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
      assignmentFilesCount: assignment.assignmentFiles.length,
      notesFilesCount: assignment.notesFiles.length,
      isDraft: assignment.isDraft,
    }));
  },
});

export const deleteAssignment = mutation({
  args: { assignmentId: v.id("assignments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }

    // Verify the class belongs to the user
    const classDoc = await ctx.db.get(assignment.classId);
    if (!classDoc || classDoc.teacherId !== userId) {
      throw new Error("Access denied");
    }

    // Delete all questions for this assignment
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_assignmentId", (q) => q.eq("assignmentId", args.assignmentId))
      .collect();

    for (const question of questions) {
      await ctx.db.delete(question._id);
    }

    // Delete all storage files
    for (const file of [...assignment.assignmentFiles, ...assignment.notesFiles]) {
      await ctx.storage.delete(file.storageId);
    }

    // Delete the assignment
    await ctx.db.delete(args.assignmentId);

    return null;
  },
});

export const renameAssignment = mutation({
  args: {
    assignmentId: v.id("assignments"),
    name: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }

    // Verify the class belongs to the user
    const classDoc = await ctx.db.get(assignment.classId);
    if (!classDoc || classDoc.teacherId !== userId) {
      throw new Error("Access denied");
    }

    await ctx.db.patch(args.assignmentId, { name: args.name });

    return null;
  },
});
