"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft,
  Upload,
  X,
  FileText,
  Image as ImageIcon,
  Loader2,
  FileIcon,
  Copy,
  Check,
  ExternalLink,
  Info,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { QuestionsReviewPanel } from "@/components/questions-review-panel";
import { EditAnswerDialog } from "@/components/edit-answer-dialog";
import { FileListCompact } from "@/components/file-list-compact";
import {
  FileCategory,
  AnswerSource,
  KeyPoint,
  UploadedFile,
  UploadingFile,
} from "@/lib/types";

const ACCEPTED_FILE_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".pptx",
  ],
};

const ACCEPTED_EXTENSIONS = Object.values(ACCEPTED_FILE_TYPES).flat().join(",");
const MAX_TOTAL_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

export default function AssignmentPage() {
  const params = useParams();
  const classId = params.classId as Id<"classes">;
  const assignmentId = params.assignmentId as Id<"assignments">;

  const classData = useQuery(api.classes.getClass, { classId });
  const assignment = useQuery(api.assignments.getAssignment, { assignmentId });
  const questions = useQuery(api.questions.listQuestions, { assignmentId });

  // Determine if this is edit mode based on isDraft
  const isEditMode = assignment?.isDraft === true;

  if (classData === undefined || assignment === undefined) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (classData === null || assignment === null) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-semibold">Assignment not found</h2>
        <p className="text-muted-foreground">
          This assignment doesn&apos;t exist or you don&apos;t have access to
          it.
        </p>
        <Button asChild>
          <Link href="/classes">
            <ArrowLeft className="h-4 w-4" />
            Back to Classes
          </Link>
        </Button>
      </div>
    );
  }

  if (isEditMode) {
    return (
      <EditAssignmentView
        classId={classId}
        assignmentId={assignmentId}
        classData={classData}
        assignment={assignment}
      />
    );
  }

  return (
    <ReviewAssignmentView
      classId={classId}
      assignmentId={assignmentId}
      classData={classData}
      assignment={assignment}
      questions={questions || []}
    />
  );
}

// Edit/Create Assignment View Component
function EditAssignmentView({
  classId,
  assignmentId,
  classData,
  assignment,
}: {
  classId: Id<"classes">;
  assignmentId: Id<"assignments">;
  classData: { name: string };
  assignment: {
    name: string;
    assignmentFiles: Array<{
      storageId: Id<"_storage">;
      fileName: string;
      contentType: string;
      size?: number;
      url: string | null;
    }>;
    notesFiles: Array<{
      storageId: Id<"_storage">;
      fileName: string;
      contentType: string;
      size?: number;
      url: string | null;
    }>;
    additionalInfo?: string;
  };
}) {
  const router = useRouter();
  const assignmentFileInputRef = useRef<HTMLInputElement>(null);
  const notesFileInputRef = useRef<HTMLInputElement>(null);

  const generateUploadUrl = useMutation(api.assignments.generateUploadUrl);
  const validateUploadedFile = useMutation(
    api.assignments.validateUploadedFile,
  );
  const deleteFile = useMutation(api.assignments.deleteFile);
  const createAssignment = useMutation(api.assignments.createAssignment);
  const saveDraft = useMutation(api.assignments.saveDraft);
  const processAssignment = useAction(api.processAssignment.processAssignment);

  const [name, setName] = useState(assignment.name);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [additionalInfo, setAdditionalInfo] = useState(
    assignment.additionalInfo || "",
  );
  const [assignmentFiles, setAssignmentFiles] = useState<UploadedFile[]>(() =>
    assignment.assignmentFiles.map((f) => ({
      id: crypto.randomUUID(),
      storageId: f.storageId,
      fileName: f.fileName,
      contentType: f.contentType,
      size: f.size || 0,
      previewUrl: f.url || "",
    })),
  );
  const [notesFiles, setNotesFiles] = useState<UploadedFile[]>(() =>
    assignment.notesFiles.map((f) => ({
      id: crypto.randomUUID(),
      storageId: f.storageId,
      fileName: f.fileName,
      contentType: f.contentType,
      size: f.size || 0,
      previewUrl: f.url || "",
    })),
  );
  const [uploadingAssignmentFiles, setUploadingAssignmentFiles] = useState<
    UploadingFile[]
  >([]);
  const [uploadingNotesFiles, setUploadingNotesFiles] = useState<
    UploadingFile[]
  >([]);
  const [isDraggingAssignment, setIsDraggingAssignment] = useState(false);
  const [isDraggingNotes, setIsDraggingNotes] = useState(false);
  const [draggingFile, setDraggingFile] = useState<{
    file: UploadedFile;
    fromCategory: FileCategory;
  } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const [dataLoaded] = useState(true);
  const saveDraftTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [dialogSize, setDialogSize] = useState({ width: 80, height: 90 });
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

  // Auto-save draft when data changes
  useEffect(() => {
    if (!dataLoaded) return;

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
        await saveDraft({
          classId,
          draftId: assignmentId,
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
    dataLoaded,
    assignmentId,
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
            `"${file.name}" is not a supported file type. Only JPEG, PNG, PDF, Word, and PowerPoint files are allowed.`,
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
            {
              id: fileId,
              storageId: validated.storageId,
              fileName: file.name,
              contentType: validated.contentType,
              size: validated.size,
              previewUrl,
            },
            ...prev,
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
    const confirmed = window.confirm(
      `Remove "${file.fileName}" from this assignment?`,
    );
    if (!confirmed) return;

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

  const handleMoveFile = useCallback(
    (
      file: UploadedFile,
      fromCategory: FileCategory,
      toCategory: FileCategory,
    ) => {
      if (fromCategory === toCategory) return;

      const setSourceFiles =
        fromCategory === "assignment" ? setAssignmentFiles : setNotesFiles;
      const setDestFiles =
        toCategory === "assignment" ? setAssignmentFiles : setNotesFiles;

      // Remove from source
      setSourceFiles((prev) => prev.filter((f) => f.id !== file.id));
      // Add to destination
      setDestFiles((prev) => [...prev, file]);

      toast.success(
        `Moved "${file.fileName}" to ${toCategory === "assignment" ? "Assignment" : "Notes"}`,
      );
    },
    [],
  );

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

      // Check if this is an internal file move
      if (draggingFile) {
        handleMoveFile(draggingFile.file, draggingFile.fromCategory, category);
        setDraggingFile(null);
        return;
      }

      // External file drop
      if (e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files, category);
      }
    },
    [handleFileUpload, draggingFile, handleMoveFile],
  );

  const handleShowConfirmation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter an assignment name");
      return;
    }
    if (assignmentFiles.length === 0) {
      toast.error("Please upload at least one assignment file");
      return;
    }
    if (notesFiles.length === 0) {
      toast.error("Please upload at least one notes file");
      return;
    }
    setShowConfirmDialog(true);
  };

  const handleCreateAssignment = async () => {
    // Cancel any pending draft save
    if (saveDraftTimeoutRef.current) {
      clearTimeout(saveDraftTimeoutRef.current);
    }

    setIsCreating(true);
    setShowConfirmDialog(false);

    try {
      const newAssignmentId = await createAssignment({
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
        draftId: assignmentId,
      });

      toast.success("Assignment created! Processing questions...");

      // Trigger processing in the background (don't await)
      processAssignment({ assignmentId: newAssignmentId }).then((result) => {
        if (result.success) {
          toast.success(
            `Processed ${result.questionsExtracted} questions with ${result.answersGenerated} answers`,
          );
        } else {
          toast.error(`Processing failed: ${result.error}`);
        }
      });

      // Navigate to the same URL - the assignment is no longer a draft so it will show review view
      router.replace(`/classes/${classId}/${newAssignmentId}`);
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
    const openFilePicker = () => fileInputRef.current?.click();

    return (
      <div className="flex-1 space-y-2">
        <Label>{label}</Label>
        <div
          className={`relative rounded-lg border-2 border-dashed p-8 py-12 text-center transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          }`}
          role="button"
          tabIndex={0}
          onDragOver={(e) => handleDragOver(e, category)}
          onDragLeave={(e) => handleDragLeave(e, category)}
          onDrop={(e) => handleDrop(e, category)}
          onClick={openFilePicker}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openFilePicker();
            }
          }}
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
              onClick={(e) => {
                e.stopPropagation();
                openFilePicker();
              }}
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
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  setDraggingFile({ file, fromCategory: category });
                }}
                onDragEnd={() => {
                  setDraggingFile(null);
                  setIsDraggingAssignment(false);
                  setIsDraggingNotes(false);
                }}
                className={`cursor-grab hover:bg-muted/50 transition-all active:cursor-grabbing ${
                  draggingFile?.file.id === file.id ? "opacity-50 scale-95" : ""
                }`}
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

      <form onSubmit={handleShowConfirmation} className="space-y-6">
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
            "Upload assignment files here (images, PDFs, Word docs)",
          )}
          {renderUploadArea(
            "notes",
            "Notes / Reference Materials",
            "Upload notes & resources here (images, PDFs, Word docs)",
          )}
        </div>

        {/* Additional Information */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="additionalInfo">Additional Information</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Additional information examples"
                  className="text-muted-foreground hover:text-foreground transition"
                >
                  <Info className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                Examples: which questions to skip or rename, tweak MCQ options,
                required methods (e.g., show work, use graphing), answer formats
                (units/decimals), or extra context students should consider.
              </TooltipContent>
            </Tooltip>
          </div>
          <textarea
            id="additionalInfo"
            placeholder="e.g., Skip questions 3 and 7, Reword Q5 to be harder"
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
          className="!max-w-none flex flex-col"
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
            <div className="flex-1 min-h-0 overflow-auto">
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
                  className="w-full h-full rounded-md"
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

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm Assignment Creation</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">
                Assignment Name
              </Label>
              <p className="font-medium">{name}</p>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">
                Assignment Files ({assignmentFiles.length})
              </Label>
              <div className="mt-1 space-y-1">
                {assignmentFiles.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="flex items-center gap-2 text-sm w-full text-left hover:bg-muted/50 rounded px-1 py-0.5 -mx-1 transition-colors"
                    onClick={() => setPreviewFile(f)}
                  >
                    {getFileIcon(f.contentType)}
                    <span className="truncate hover:underline">
                      {f.fileName}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">
                Notes Files ({notesFiles.length})
              </Label>
              <div className="mt-1 space-y-1">
                {notesFiles.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="flex items-center gap-2 text-sm w-full text-left hover:bg-muted/50 rounded px-1 py-0.5 -mx-1 transition-colors"
                    onClick={() => setPreviewFile(f)}
                  >
                    {getFileIcon(f.contentType)}
                    <span className="truncate hover:underline">
                      {f.fileName}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {additionalInfo && (
              <div>
                <Label className="text-xs text-muted-foreground">
                  Additional Info
                </Label>
                <p className="text-sm whitespace-pre-wrap bg-muted/50 rounded p-2 mt-1">
                  {additionalInfo}
                </p>
              </div>
            )}

            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-sm mt-5">
              <p className="text-blue-800 dark:text-blue-200">
                After creating, your questions will be extracted and proceessed.
                This may take a few minutes.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
            >
              Go Back
            </Button>
            <Button onClick={handleCreateAssignment} disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                "Create Assignment"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Review Assignment View Component
function ReviewAssignmentView({
  classId,
  assignmentId,
  classData,
  assignment,
  questions,
}: {
  classId: Id<"classes">;
  assignmentId: Id<"assignments">;
  classData: { name: string };
  assignment: {
    name: string;
    assignmentFiles: Array<{
      storageId: Id<"_storage">;
      fileName: string;
      contentType: string;
      url: string | null;
    }>;
    notesFiles: Array<{
      storageId: Id<"_storage">;
      fileName: string;
      contentType: string;
      url: string | null;
    }>;
    additionalInfo?: string;
    processingStatus?: string;
    processingError?: string;
  };
  questions: Array<{
    _id: Id<"questions">;
    questionNumber: string;
    extractionOrder: number;
    questionText: string;
    questionType: string;
    answer?: string | string[];
    keyPoints?: KeyPoint[];
    source?: AnswerSource;
    status: "pending" | "processing" | "ready" | "approved";
  }>;
}) {
  const [copied, setCopied] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const processAssignment = useAction(api.processAssignment.processAssignment);
  const stopProcessing = useMutation(api.assignments.stopProcessing);
  const [editingQuestion, setEditingQuestion] = useState<{
    _id: Id<"questions">;
    questionNumber: string;
    extractionOrder: number;
    questionText: string;
    questionType: string;
    answer?: string | string[];
    keyPoints?: KeyPoint[];
    source?: AnswerSource;
    status: "pending" | "processing" | "ready" | "approved";
  } | null>(null);
  const [previewFile, setPreviewFile] = useState<{
    fileName: string;
    contentType: string;
    url: string;
  } | null>(null);

  const studentLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/learn/${assignmentId}`
      : `/learn/${assignmentId}`;

  const previousProcessingStatus = useRef<string | undefined>(
    assignment.processingStatus,
  );

  const isProcessing =
    assignment.processingStatus === "extracting" ||
    assignment.processingStatus === "generating_answers";

  useEffect(() => {
    const prev = previousProcessingStatus.current;
    const curr = assignment.processingStatus;
    const extractionFinished =
      prev === "extracting" && curr !== "extracting" && curr !== "error";
    const answersFinished =
      prev === "generating_answers" &&
      (curr === "ready" ||
        curr === "approved" ||
        curr === undefined ||
        curr === null);

    if (extractionFinished) {
      const message =
        curr === "generating_answers"
          ? "Question extraction complete. Generating answers..."
          : "Question extraction complete.";
      toast.success(message);
    }
    if (answersFinished) {
      toast.success("Answer generation complete");
    }

    previousProcessingStatus.current = curr;
  }, [assignment.processingStatus]);

  const handleStopGeneration = useCallback(async () => {
    setIsStopping(true);
    try {
      await stopProcessing({ assignmentId });
      toast.success("Stopped generation");
    } catch (error) {
      console.error(error);
      toast.error("Failed to stop generation");
    } finally {
      setIsStopping(false);
      setShowStopConfirm(false);
    }
  }, [assignmentId, stopProcessing]);

  const handleRegenerateAll = useCallback(async () => {
    setIsRegenerating(true);
    try {
      const result = await processAssignment({ assignmentId });
      if (result.success) {
        toast.success(
          `Processed ${result.questionsExtracted} questions with ${result.answersGenerated ?? 0} answers`,
        );
      } else {
        toast.error(result.error || "Regeneration failed");
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to regenerate");
    } finally {
      setIsRegenerating(false);
      setShowRegenConfirm(false);
    }
  }, [assignmentId, processAssignment]);

  const headerActionsNode = isProcessing ? (
    <AlertDialog open={showStopConfirm} onOpenChange={setShowStopConfirm}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={isStopping}
          onClick={() => setShowStopConfirm(true)}
          aria-label="Stop generating"
        >
          {isStopping ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
            </>
          ) : (
            <X className="h-4 w-4" />
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop generating?</AlertDialogTitle>
          <AlertDialogDescription>
            This halts extraction/answering in-progress. You can restart later
            with Regenerate all.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isStopping}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleStopGeneration}
            disabled={isStopping}
          >
            {isStopping ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                Stopping...
              </>
            ) : (
              "Stop"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : (
    <AlertDialog open={showRegenConfirm} onOpenChange={setShowRegenConfirm}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={isRegenerating}
          onClick={() => setShowRegenConfirm(true)}
          aria-label="Regenerate all"
        >
          {isRegenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
            </>
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Regenerate all questions?</AlertDialogTitle>
          <AlertDialogDescription>
            This re-extracts questions and regenerates answers using the
            uploaded files. Existing edits may be overwritten.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRegenerating}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleRegenerateAll}
            disabled={isRegenerating}
          >
            {isRegenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                Regenerating...
              </>
            ) : (
              "Confirm"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(studentLink);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

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
          <p className="text-sm text-muted-foreground">{classData.name}</p>
          <h1 className="text-3xl font-bold tracking-tight">
            {assignment.name}
          </h1>
        </div>
      </div>

      {/* Student Link - outside card */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">
          Student Link:
        </span>
        <code className="rounded bg-muted px-2 py-1 text-xs font-mono truncate max-w-md">
          {studentLink}
        </code>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleCopyLink}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
          <a href={studentLink} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      </div>

      {/* Uploaded Information - Compact Card */}
      <Card className="!py-0 !gap-3">
        <CardHeader className="!pt-4 !pb-0">
          <CardTitle className="text-base">Uploaded Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 !pt-0 !pb-2">
          {/* Assignment Files */}
          <div className="flex items-start gap-2">
            <span className="text-sm text-muted-foreground shrink-0 w-20">
              Assignment:
            </span>
            <FileListCompact
              files={assignment.assignmentFiles}
              onFileClick={setPreviewFile}
            />
          </div>

          {/* Notes Files */}
          <div className="flex items-start gap-2">
            <span className="text-sm text-muted-foreground shrink-0 w-20">
              Notes:
            </span>
            <FileListCompact
              files={assignment.notesFiles}
              onFileClick={setPreviewFile}
            />
          </div>

          {/* Additional Information */}
          {assignment.additionalInfo && (
            <div className="flex items-start gap-2">
              <span className="text-sm text-muted-foreground shrink-0 w-20">
                Info:
              </span>
              <p className="text-sm whitespace-pre-wrap">
                {assignment.additionalInfo}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error State (skip showing banner when teacher intentionally stopped) */}
      {assignment.processingStatus === "error" &&
        assignment.processingError !== "Stopped by teacher" && (
          <Card className="border-destructive bg-destructive/5">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-destructive/10 p-2">
                  <X className="h-4 w-4 text-destructive" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="font-medium text-destructive">
                    Processing Failed
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {assignment.processingError ||
                      "An error occurred while processing the assignment."}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isRetrying}
                  onClick={async () => {
                    setIsRetrying(true);
                    try {
                      const result = await processAssignment({ assignmentId });
                      if (result.success) {
                        toast.success(
                          `Processed ${result.questionsExtracted} questions`,
                        );
                      } else {
                        toast.error(result.error || "Processing failed");
                      }
                    } catch (error) {
                      console.error(error);
                      toast.error("Failed to retry processing");
                    } finally {
                      setIsRetrying(false);
                    }
                  }}
                >
                  {isRetrying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      Retrying...
                    </>
                  ) : (
                    "Retry"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

      {/* Questions Review Section */}
      {(() => {
        const allQuestions = questions || [];
        const isProcessing =
          assignment.processingStatus === "extracting" ||
          assignment.processingStatus === "generating_answers";

        // Show section if processing or has questions
        if (!isProcessing && allQuestions.length === 0) return null;

        return (
          <QuestionsReviewPanel
            questions={allQuestions}
            assignmentId={assignmentId}
            isProcessing={isProcessing}
            processingStatus={assignment.processingStatus}
            headerActions={headerActionsNode}
            onEdit={(q) => setEditingQuestion(q)}
          />
        );
      })()}

      {/* Edit Answer Dialog */}
      <EditAnswerDialog
        question={editingQuestion}
        open={editingQuestion !== null}
        onOpenChange={(open) => !open && setEditingQuestion(null)}
      />

      {/* File Preview Dialog */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent
          className="!max-w-none flex flex-col"
          style={{ width: "80vw", height: "85vh" }}
        >
          <DialogHeader>
            <DialogTitle className="truncate pr-8">
              {previewFile?.fileName}
            </DialogTitle>
          </DialogHeader>
          {previewFile && (
            <div className="flex-1 min-h-0 overflow-auto">
              {previewFile.contentType.startsWith("image/") && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewFile.url}
                  alt={previewFile.fileName}
                  className="w-full h-auto rounded-md"
                />
              )}
              {previewFile.contentType === "application/pdf" && (
                <iframe
                  src={previewFile.url}
                  className="w-full h-full rounded-md"
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
                    href={previewFile.url}
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
