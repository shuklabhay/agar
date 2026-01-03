"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  Download,
  Copy,
  Check,
  ExternalLink,
  FileIcon,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useState } from "react";
import { QuestionsReviewPanel } from "@/components/questions-review-panel";
import { EditAnswerDialog } from "@/components/edit-answer-dialog";

export default function AssignmentDetailPage() {
  const params = useParams();
  const classId = params.classId as Id<"classes">;
  const assignmentId = params.assignmentId as Id<"assignments">;

  const classData = useQuery(api.classes.getClass, { classId });
  const assignment = useQuery(api.assignments.getAssignment, { assignmentId });
  const questions = useQuery(api.questions.listQuestions, { assignmentId });

  const [copied, setCopied] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<{
    _id: Id<"questions">;
    questionNumber: number;
    questionText: string;
    questionType: string;
    answer?: string | string[];
    keyPoints?: string[];
    source?: "notes" | string[];
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

  const renderFileListCompact = (
    files: Array<{
      storageId: Id<"_storage">;
      fileName: string;
      contentType: string;
      url: string | null;
    }>,
  ) => {
    if (files.length === 0) {
      return <span className="text-sm text-muted-foreground">None</span>;
    }

    return (
      <div className="flex flex-wrap gap-1.5">
        {files.map((file, index) => (
          <button
            key={index}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 hover:bg-muted text-sm transition-colors"
            onClick={() =>
              file.url &&
              setPreviewFile({
                fileName: file.fileName,
                contentType: file.contentType,
                url: file.url,
              })
            }
          >
            {getFileIcon(file.contentType)}
            <span className="truncate max-w-[150px]">{file.fileName}</span>
            <Badge variant="secondary" className="text-[10px] px-1 py-0">
              {getFileTypeBadge(file.contentType)}
            </Badge>
            {file.url && (
              <a
                href={file.url}
                download={file.fileName}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="hover:text-primary"
              >
                <Download className="h-3 w-3" />
              </a>
            )}
          </button>
        ))}
      </div>
    );
  };

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
            {renderFileListCompact(assignment.assignmentFiles)}
          </div>

          {/* Notes Files */}
          <div className="flex items-start gap-2">
            <span className="text-sm text-muted-foreground shrink-0 w-20">
              Notes:
            </span>
            {renderFileListCompact(assignment.notesFiles)}
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
