"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Upload,
  X,
  FileText,
  Image as ImageIcon,
  Loader2,
  FileIcon,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

const ACCEPTED_FILE_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
};

const ACCEPTED_EXTENSIONS = Object.values(ACCEPTED_FILE_TYPES).flat().join(",");
const MAX_TOTAL_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

type UploadedFile = {
  id: string;
  storageId: Id<"_storage">;
  fileName: string;
  contentType: string;
  size: number;
  previewUrl: string;
};

type UploadingFile = {
  id: string;
  fileName: string;
  progress: number;
  status: "uploading" | "validating" | "error";
  error?: string;
};

type FileCategory = "assignment" | "notes";

export default function NewAssignmentPage() {
  const params = useParams();
  const router = useRouter();
  const classId = params.classId as Id<"classes">;
  const assignmentFileInputRef = useRef<HTMLInputElement>(null);
  const notesFileInputRef = useRef<HTMLInputElement>(null);

  const classData = useQuery(api.classes.getClass, { classId });
  const existingDraft = useQuery(api.assignments.getDraft, { classId });
  const generateUploadUrl = useMutation(api.assignments.generateUploadUrl);
  const validateUploadedFile = useMutation(
    api.assignments.validateUploadedFile,
  );
  const deleteFile = useMutation(api.assignments.deleteFile);
  const createAssignment = useMutation(api.assignments.createAssignment);
  const saveDraft = useMutation(api.assignments.saveDraft);

  const [name, setName] = useState("");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [assignmentFiles, setAssignmentFiles] = useState<UploadedFile[]>([]);
  const [notesFiles, setNotesFiles] = useState<UploadedFile[]>([]);
  const [uploadingAssignmentFiles, setUploadingAssignmentFiles] = useState<
    UploadingFile[]
  >([]);
  const [uploadingNotesFiles, setUploadingNotesFiles] = useState<
    UploadingFile[]
  >([]);
  const [isDraggingAssignment, setIsDraggingAssignment] = useState(false);
  const [isDraggingNotes, setIsDraggingNotes] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const [draftId, setDraftId] = useState<Id<"assignments"> | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const saveDraftTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [dialogSize, setDialogSize] = useState({ width: 80, height: 90 }); // vw/vh
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    edge: string;
  } | null>(null);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, edge: string) => {
      e.preventDefault();
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startWidth: dialogSize.width,
        startHeight: dialogSize.height,
        edge,
      };

      const handleMouseMove = (e: MouseEvent) => {
        if (!resizeRef.current) return;
        const { startX, startY, startWidth, startHeight, edge } =
          resizeRef.current;
        const deltaX = ((e.clientX - startX) / window.innerWidth) * 100;
        const deltaY = ((e.clientY - startY) / window.innerHeight) * 100;

        setDialogSize((prev) => {
          let newWidth = prev.width;
          let newHeight = prev.height;

          if (edge.includes("e")) newWidth = Math.max(30, startWidth + deltaX);
          if (edge.includes("w")) newWidth = Math.max(30, startWidth - deltaX);
          if (edge.includes("s"))
            newHeight = Math.max(30, startHeight + deltaY);
          if (edge.includes("n"))
            newHeight = Math.max(30, startHeight - deltaY);

          return {
            width: Math.min(95, newWidth),
            height: Math.min(95, newHeight),
          };
        });
      };

      const handleMouseUp = () => {
        resizeRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [dialogSize],
  );

  // Load existing draft on mount
  useEffect(() => {
    if (existingDraft && !draftLoaded) {
      setDraftId(existingDraft._id);
      setName(existingDraft.name);
      setAdditionalInfo(existingDraft.additionalInfo || "");
      // Convert draft files to UploadedFile format
      setAssignmentFiles(
        existingDraft.assignmentFiles.map((f) => ({
          id: crypto.randomUUID(),
          storageId: f.storageId,
          fileName: f.fileName,
          contentType: f.contentType,
          size: f.size || 0,
          previewUrl: f.url || "",
        })),
      );
      setNotesFiles(
        existingDraft.notesFiles.map((f) => ({
          id: crypto.randomUUID(),
          storageId: f.storageId,
          fileName: f.fileName,
          contentType: f.contentType,
          size: f.size || 0,
          previewUrl: f.url || "",
        })),
      );
      setDraftLoaded(true);
    } else if (existingDraft === null && !draftLoaded) {
      setDraftLoaded(true);
    }
  }, [existingDraft, draftLoaded]);

  // Auto-save draft when data changes
  useEffect(() => {
    if (!draftLoaded) return;

    // Only save if there's something to save
    const hasContent =
      name.trim() ||
      assignmentFiles.length > 0 ||
      notesFiles.length > 0 ||
      additionalInfo.trim();

    if (!hasContent) return;

    // Debounce the save
    if (saveDraftTimeoutRef.current) {
      clearTimeout(saveDraftTimeoutRef.current);
    }

    saveDraftTimeoutRef.current = setTimeout(async () => {
      try {
        const newDraftId = await saveDraft({
          classId,
          draftId: draftId || undefined,
          name: name.trim() || "Untitled Assignment",
          assignmentFiles: assignmentFiles.map((f) => ({
            storageId: f.storageId,
            fileName: f.fileName,
            contentType: f.contentType,
            size: f.size,
          })),
          notesFiles: notesFiles.map((f) => ({
            storageId: f.storageId,
            fileName: f.fileName,
            contentType: f.contentType,
            size: f.size,
          })),
          additionalInfo: additionalInfo.trim() || undefined,
        });
        if (!draftId) {
          setDraftId(newDraftId);
        }
      } catch {
        // Silent fail for auto-save
      }
    }, 1000);

    return () => {
      if (saveDraftTimeoutRef.current) {
        clearTimeout(saveDraftTimeoutRef.current);
      }
    };
  }, [
    name,
    assignmentFiles,
    notesFiles,
    additionalInfo,
    draftLoaded,
    draftId,
    classId,
    saveDraft,
  ]);

  const totalUploadedSize =
    assignmentFiles.reduce((sum, f) => sum + f.size, 0) +
    notesFiles.reduce((sum, f) => sum + f.size, 0);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileUpload = useCallback(
    async (files: FileList | File[], category: FileCategory) => {
      const fileArray = Array.from(files);
      const setUploadedFiles =
        category === "assignment" ? setAssignmentFiles : setNotesFiles;
      const setUploadingFiles =
        category === "assignment"
          ? setUploadingAssignmentFiles
          : setUploadingNotesFiles;

      // Calculate current total including files being uploaded
      let currentTotal =
        assignmentFiles.reduce((sum, f) => sum + f.size, 0) +
        notesFiles.reduce((sum, f) => sum + f.size, 0);

      for (const file of fileArray) {
        // Client-side validation - file type
        const allowedTypes = Object.keys(ACCEPTED_FILE_TYPES);
        if (!allowedTypes.includes(file.type)) {
          toast.error(
            `"${file.name}" is not a supported file type. Only JPEG, PNG, PDF, and Word documents are allowed.`,
          );
          continue;
        }

        // Client-side validation - total size
        if (currentTotal + file.size > MAX_TOTAL_SIZE_BYTES) {
          toast.error(
            `"${file.name}" would exceed the 15MB total limit. Current usage: ${formatFileSize(currentTotal)}`,
          );
          continue;
        }

        currentTotal += file.size;
        const fileId = crypto.randomUUID();
        setUploadingFiles((prev) => [
          ...prev,
          { id: fileId, fileName: file.name, progress: 0, status: "uploading" },
        ]);

        try {
          // Get upload URL
          const uploadUrl = await generateUploadUrl();

          // Upload file with progress tracking
          const xhr = new XMLHttpRequest();

          await new Promise<void>((resolve, reject) => {
            xhr.upload.addEventListener("progress", (e) => {
              if (e.lengthComputable) {
                const progress = Math.round((e.loaded / e.total) * 100);
                setUploadingFiles((prev) =>
                  prev.map((f) => (f.id === fileId ? { ...f, progress } : f)),
                );
              }
            });

            xhr.addEventListener("load", () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
              } else {
                reject(new Error("Upload failed"));
              }
            });

            xhr.addEventListener("error", () =>
              reject(new Error("Upload failed")),
            );

            xhr.open("POST", uploadUrl);
            xhr.send(file);
          });

          // Update status to validating
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.id === fileId ? { ...f, status: "validating" } : f,
            ),
          );

          // Get storage ID from response and validate
          const response = await fetch(uploadUrl, {
            method: "POST",
            body: file,
          });
          const { storageId } = await response.json();

          // Validate file type server-side
          const validated = await validateUploadedFile({ storageId });

          // Create blob URL for preview
          const previewUrl = URL.createObjectURL(file);

          // Success - add to uploaded files
          setUploadedFiles((prev) => [
            ...prev,
            {
              id: fileId,
              storageId: validated.storageId,
              fileName: file.name,
              contentType: validated.contentType,
              size: validated.size,
              previewUrl,
            },
          ]);

          // Remove from uploading
          setUploadingFiles((prev) => prev.filter((f) => f.id !== fileId));
          toast.success(`"${file.name}" uploaded successfully`);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Upload failed";
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.id === fileId
                ? { ...f, status: "error", error: errorMessage }
                : f,
            ),
          );
          toast.error(`Failed to upload "${file.name}": ${errorMessage}`);

          // Remove error file after a delay
          setTimeout(() => {
            setUploadingFiles((prev) => prev.filter((f) => f.id !== fileId));
          }, 3000);
        }
      }
    },
    [generateUploadUrl, validateUploadedFile, assignmentFiles, notesFiles],
  );

  const handleRemoveFile = async (
    file: UploadedFile,
    category: FileCategory,
  ) => {
    const setUploadedFiles =
      category === "assignment" ? setAssignmentFiles : setNotesFiles;
    try {
      await deleteFile({ storageId: file.storageId });
      URL.revokeObjectURL(file.previewUrl);
      setUploadedFiles((prev) => prev.filter((f) => f.id !== file.id));
      toast.success(`"${file.fileName}" removed`);
    } catch {
      toast.error("Failed to remove file");
    }
  };

  const handleDragOver = useCallback(
    (e: React.DragEvent, category: FileCategory) => {
      e.preventDefault();
      if (category === "assignment") {
        setIsDraggingAssignment(true);
      } else {
        setIsDraggingNotes(true);
      }
    },
    [],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent, category: FileCategory) => {
      e.preventDefault();
      if (category === "assignment") {
        setIsDraggingAssignment(false);
      } else {
        setIsDraggingNotes(false);
      }
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, category: FileCategory) => {
      e.preventDefault();
      if (category === "assignment") {
        setIsDraggingAssignment(false);
      } else {
        setIsDraggingNotes(false);
      }
      if (e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files, category);
      }
    },
    [handleFileUpload],
  );

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter an assignment name");
      return;
    }

    // Cancel any pending draft save
    if (saveDraftTimeoutRef.current) {
      clearTimeout(saveDraftTimeoutRef.current);
    }

    setIsCreating(true);
    try {
      const assignmentId = await createAssignment({
        classId,
        name: name.trim(),
        assignmentFiles: assignmentFiles.map((f) => ({
          storageId: f.storageId,
          fileName: f.fileName,
          contentType: f.contentType,
          size: f.size,
        })),
        notesFiles: notesFiles.map((f) => ({
          storageId: f.storageId,
          fileName: f.fileName,
          contentType: f.contentType,
          size: f.size,
        })),
        additionalInfo: additionalInfo.trim() || undefined,
        draftId: draftId || undefined,
      });
      toast.success("Assignment created successfully");
      router.push(`/classes/${classId}/${assignmentId}`);
    } catch {
      toast.error("Failed to create assignment");
      setIsCreating(false);
    }
  };

  const getFileIcon = (contentType: string) => {
    if (contentType.startsWith("image/")) {
      return <ImageIcon className="h-4 w-4" />;
    }
    if (
      contentType === "application/msword" ||
      contentType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      return <FileIcon className="h-4 w-4" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  const getFileTypeBadge = (contentType: string) => {
    switch (contentType) {
      case "image/jpeg":
        return "JPEG";
      case "image/png":
        return "PNG";
      case "application/pdf":
        return "PDF";
      case "application/msword":
        return "DOC";
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return "DOCX";
      default:
        return "File";
    }
  };

  const renderUploadArea = (
    category: FileCategory,
    label: string,
    description: string,
  ) => {
    const isDragging =
      category === "assignment" ? isDraggingAssignment : isDraggingNotes;
    const fileInputRef =
      category === "assignment" ? assignmentFileInputRef : notesFileInputRef;
    const uploadedFilesList =
      category === "assignment" ? assignmentFiles : notesFiles;
    const uploadingFilesList =
      category === "assignment"
        ? uploadingAssignmentFiles
        : uploadingNotesFiles;

    return (
      <div className="flex-1 space-y-2">
        <Label>{label}</Label>
        <div
          className={`relative rounded-lg border-2 border-dashed p-8 py-12 text-center transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          }`}
          onDragOver={(e) => handleDragOver(e, category)}
          onDragLeave={(e) => handleDragLeave(e, category)}
          onDrop={(e) => handleDrop(e, category)}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            multiple
            onChange={(e) =>
              e.target.files && handleFileUpload(e.target.files, category)
            }
            className="hidden"
          />
          <Upload className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Drag and drop files here, or{" "}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-primary underline-offset-4 hover:underline"
            >
              browse
            </button>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>

        {/* Uploading Files */}
        {uploadingFilesList.length > 0 && (
          <div className="space-y-1.5">
            {uploadingFilesList.map((file) => (
              <Card key={file.id}>
                <CardContent className="flex items-center gap-2 p-2 min-h-[40px]">
                  {file.status === "uploading" ? (
                    <div className="relative h-4 w-4">
                      <svg className="h-4 w-4 -rotate-90" viewBox="0 0 16 16">
                        <circle
                          cx="8"
                          cy="8"
                          r="6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="text-muted"
                        />
                        <circle
                          cx="8"
                          cy="8"
                          r="6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeDasharray={`${(file.progress / 100) * 37.7} 37.7`}
                          className="text-primary"
                        />
                      </svg>
                    </div>
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{file.fileName}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {file.status === "uploading"
                      ? `${file.progress}%`
                      : file.status === "validating"
                        ? "Validating..."
                        : file.error}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Uploaded Files */}
        {uploadedFilesList.length > 0 && (
          <div className="space-y-1.5">
            {uploadedFilesList.map((file) => (
              <Card
                key={file.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setPreviewFile(file)}
              >
                <CardContent className="flex items-center gap-2 p-2">
                  {getFileIcon(file.contentType)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{file.fileName}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {getFileTypeBadge(file.contentType)}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveFile(file, category);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (classData === undefined) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (classData === null) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-semibold">Class not found</h2>
        <Button asChild>
          <Link href="/classes">
            <ArrowLeft className="h-4 w-4" />
            Back to Classes
          </Link>
        </Button>
      </div>
    );
  }

  const isUploading =
    uploadingAssignmentFiles.length > 0 || uploadingNotesFiles.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" asChild className="mt-1">
          <Link href={`/classes/${classId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">New Assignment</h1>
          <p className="text-muted-foreground mt-1">
            Create a new assignment for {classData.name}
          </p>
        </div>
      </div>

      <form onSubmit={handleCreateAssignment} className="space-y-6">
        {/* Assignment Name */}
        <div className="space-y-2">
          <Label htmlFor="name">Assignment Name</Label>
          <Input
            id="name"
            placeholder="e.g., Chapter 5 Review"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        {/* Side-by-side File Upload Areas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {renderUploadArea(
            "assignment",
            "Assignment",
            "Upload the assignment (images, PDFs, Word docs)",
          )}
          {renderUploadArea(
            "notes",
            "Notes / Reference Materials",
            "Upload notes & resources for this assignment",
          )}
        </div>

        {/* Additional Information */}
        <div className="space-y-2">
          <Label htmlFor="additionalInfo">Additional Information</Label>
          <textarea
            id="additionalInfo"
            placeholder="e.g., Skip questions 3 and 7, only accept Bernouli's equation for #5, chapter 4 notes have a sign error..."
            value={additionalInfo}
            onChange={(e) => {
              setAdditionalInfo(e.target.value);
              // Auto-resize textarea
              e.target.style.height = "auto";
              e.target.style.height = e.target.scrollHeight + "px";
            }}
            rows={1}
            className="flex w-full resize-none overflow-hidden rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        {/* Create Button */}
        <div className="flex items-center gap-3 pt-4">
          {/* Total Size Indicator */}
          {totalUploadedSize > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                Total: {formatFileSize(totalUploadedSize)} /{" "}
                {formatFileSize(MAX_TOTAL_SIZE_BYTES)} used
              </span>
              <Progress
                value={(totalUploadedSize / MAX_TOTAL_SIZE_BYTES) * 100}
                className="h-1.5 w-32"
              />
            </div>
          )}
          <div className="flex-1" />
          <Button type="button" variant="outline" asChild>
            <Link href={`/classes/${classId}`}>Cancel</Link>
          </Button>
          <Button
            type="submit"
            disabled={isCreating || !name.trim() || isUploading}
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Assignment"
            )}
          </Button>
        </div>
      </form>

      {/* File Preview Dialog */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent
          className="!max-w-none overflow-auto"
          style={{
            width: `${dialogSize.width}vw`,
            height: `${dialogSize.height}vh`,
          }}
        >
          {/* Resize handles */}
          <div
            className="absolute top-0 left-0 right-0 h-1 cursor-n-resize"
            onMouseDown={(e) => handleResizeStart(e, "n")}
          />
          <div
            className="absolute bottom-0 left-0 right-0 h-1 cursor-s-resize"
            onMouseDown={(e) => handleResizeStart(e, "s")}
          />
          <div
            className="absolute left-0 top-0 bottom-0 w-1 cursor-w-resize"
            onMouseDown={(e) => handleResizeStart(e, "w")}
          />
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-e-resize"
            onMouseDown={(e) => handleResizeStart(e, "e")}
          />
          <div
            className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize"
            onMouseDown={(e) => handleResizeStart(e, "nw")}
          />
          <div
            className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize"
            onMouseDown={(e) => handleResizeStart(e, "ne")}
          />
          <div
            className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize"
            onMouseDown={(e) => handleResizeStart(e, "sw")}
          />
          <div
            className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize"
            onMouseDown={(e) => handleResizeStart(e, "se")}
          />

          <DialogHeader>
            <DialogTitle className="truncate pr-8">
              {previewFile?.fileName}
            </DialogTitle>
          </DialogHeader>
          {previewFile && (
            <div className="flex-1 min-h-0 overflow-auto -mt-2">
              {previewFile.contentType.startsWith("image/") && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewFile.previewUrl}
                  alt={previewFile.fileName}
                  className="w-full h-auto rounded-md"
                />
              )}
              {previewFile.contentType === "application/pdf" && (
                <iframe
                  src={previewFile.previewUrl}
                  className="w-full h-full min-h-[50vh] rounded-md"
                  title={previewFile.fileName}
                />
              )}
              {(previewFile.contentType === "application/msword" ||
                previewFile.contentType ===
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document") && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <FileIcon className="h-16 w-16 mb-4" />
                  <p>Word document preview not available</p>
                  <a
                    href={previewFile.previewUrl}
                    download={previewFile.fileName}
                    className="mt-2 text-primary underline"
                  >
                    Download to view
                  </a>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
