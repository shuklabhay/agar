"use client";

import { useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Upload,
  X,
  FileText,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

const ACCEPTED_FILE_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "application/pdf": [".pdf"],
};

const ACCEPTED_EXTENSIONS = Object.values(ACCEPTED_FILE_TYPES).flat().join(",");
const MAX_TOTAL_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

type UploadedFile = {
  id: string;
  storageId: Id<"_storage">;
  fileName: string;
  contentType: string;
  size: number;
};

type UploadingFile = {
  id: string;
  fileName: string;
  progress: number;
  status: "uploading" | "validating" | "error";
  error?: string;
};

export default function NewAssignmentPage() {
  const params = useParams();
  const router = useRouter();
  const classId = params.classId as Id<"classes">;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const classData = useQuery(api.classes.getClass, { classId });
  const generateUploadUrl = useMutation(api.assignments.generateUploadUrl);
  const validateUploadedFile = useMutation(
    api.assignments.validateUploadedFile,
  );
  const deleteFile = useMutation(api.assignments.deleteFile);
  const createAssignment = useMutation(api.assignments.createAssignment);

  const [name, setName] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const totalUploadedSize = uploadedFiles.reduce((sum, f) => sum + f.size, 0);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileUpload = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);

      // Calculate current total including files being uploaded
      let currentTotal = uploadedFiles.reduce((sum, f) => sum + f.size, 0);

      for (const file of fileArray) {
        // Client-side validation - file type
        const allowedTypes = Object.keys(ACCEPTED_FILE_TYPES);
        if (!allowedTypes.includes(file.type)) {
          toast.error(
            `"${file.name}" is not a supported file type. Only JPEG, PNG, and PDF files are allowed.`,
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

          // Success - add to uploaded files
          setUploadedFiles((prev) => [
            ...prev,
            {
              id: fileId,
              storageId: validated.storageId,
              fileName: file.name,
              contentType: validated.contentType,
              size: validated.size,
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
    [generateUploadUrl, validateUploadedFile],
  );

  const handleRemoveFile = async (file: UploadedFile) => {
    try {
      await deleteFile({ storageId: file.storageId });
      setUploadedFiles((prev) => prev.filter((f) => f.id !== file.id));
      toast.success(`"${file.fileName}" removed`);
    } catch {
      toast.error("Failed to remove file");
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files);
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

    setIsCreating(true);
    try {
      const assignmentId = await createAssignment({
        classId,
        name: name.trim(),
        notes: uploadedFiles.map((f) => ({
          storageId: f.storageId,
          fileName: f.fileName,
          contentType: f.contentType,
        })),
      });
      toast.success("Assignment created successfully");
      router.push(`/classes/${classId}/${assignmentId}`);
    } catch (error) {
      toast.error("Failed to create assignment");
      setIsCreating(false);
    }
  };

  const getFileIcon = (contentType: string) => {
    if (contentType.startsWith("image/")) {
      return <ImageIcon className="h-4 w-4" />;
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
      default:
        return "File";
    }
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
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

        {/* File Upload Area */}
        <div className="space-y-2">
          <Label>Notes (Images & PDFs)</Label>
          <div
            className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              multiple
              onChange={(e) =>
                e.target.files && handleFileUpload(e.target.files)
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
            <p className="mt-1 text-xs text-muted-foreground">
              Supports JPEG, PNG, and PDF files (max 15MB total)
            </p>
          </div>
          {totalUploadedSize > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
              <span>
                {formatFileSize(totalUploadedSize)} /{" "}
                {formatFileSize(MAX_TOTAL_SIZE_BYTES)} used
              </span>
              <Progress
                value={(totalUploadedSize / MAX_TOTAL_SIZE_BYTES) * 100}
                className="h-1.5 w-24"
              />
            </div>
          )}
        </div>

        {/* Uploading Files */}
        {uploadingFiles.length > 0 && (
          <div className="space-y-2">
            {uploadingFiles.map((file) => (
              <Card key={file.id}>
                <CardContent className="flex items-center gap-3 p-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {file.fileName}
                    </p>
                    {file.status === "uploading" && (
                      <Progress value={file.progress} className="h-1 mt-1" />
                    )}
                    {file.status === "validating" && (
                      <p className="text-xs text-muted-foreground">
                        Validating...
                      </p>
                    )}
                    {file.status === "error" && (
                      <p className="text-xs text-destructive">{file.error}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Uploaded Files */}
        {uploadedFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {uploadedFiles.length} file{uploadedFiles.length !== 1 ? "s" : ""}{" "}
              ready
            </p>
            {uploadedFiles.map((file) => (
              <Card key={file.id}>
                <CardContent className="flex items-center gap-3 p-3">
                  {getFileIcon(file.contentType)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {file.fileName}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {getFileTypeBadge(file.contentType)}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemoveFile(file)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create Button */}
        <div className="flex gap-3 pt-4">
          <Button type="button" variant="outline" asChild className="flex-1">
            <Link href={`/classes/${classId}`}>Cancel</Link>
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={isCreating || !name.trim() || uploadingFiles.length > 0}
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
    </div>
  );
}
