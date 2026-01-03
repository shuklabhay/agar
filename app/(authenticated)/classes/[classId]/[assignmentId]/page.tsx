"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
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
  Link as LinkIcon,
  ExternalLink,
  FileIcon,
  Info,
  CheckCheck,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useState } from "react";
import { QuestionReviewCard } from "@/components/question-review-card";
import { EditAnswerDialog } from "@/components/edit-answer-dialog";

export default function AssignmentDetailPage() {
  const params = useParams();
  const classId = params.classId as Id<"classes">;
  const assignmentId = params.assignmentId as Id<"assignments">;

  const classData = useQuery(api.classes.getClass, { classId });
  const assignment = useQuery(api.assignments.getAssignment, { assignmentId });
  const questions = useQuery(api.questions.listQuestions, { assignmentId });

  const approveAllQuestions = useMutation(api.questions.approveAllQuestions);

  const [copied, setCopied] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<{
    _id: Id<"questions">;
    questionNumber: number;
    questionText: string;
    questionType: string;
    answer?: string | string[];
    snippets?: string[];
    source?: "notes" | string[];
    status: "pending" | "processing" | "ready" | "approved";
  } | null>(null);
  const [isApprovingAll, setIsApprovingAll] = useState(false);
  const [previewFile, setPreviewFile] = useState<{
    fileName: string;
    contentType: string;
    url: string;
  } | null>(null);

  const handleApproveAll = async () => {
    setIsApprovingAll(true);
    try {
      const result = await approveAllQuestions({ assignmentId });
      toast.success(`Approved ${result.approved} questions`);
    } catch (error) {
      toast.error("Failed to approve questions");
    } finally {
      setIsApprovingAll(false);
    }
  };

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

  const renderFileList = (
    files: Array<{
      storageId: Id<"_storage">;
      fileName: string;
      contentType: string;
      url: string | null;
    }>,
  ) => {
    if (files.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">No files</p>
      );
    }

    return (
      <div className="space-y-1.5">
        {files.map((file, index) => (
          <Card
            key={index}
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => file.url && setPreviewFile({
              fileName: file.fileName,
              contentType: file.contentType,
              url: file.url,
            })}
          >
            <CardContent className="flex items-center gap-2 p-2">
              {getFileIcon(file.contentType)}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{file.fileName}</p>
              </div>
              <Badge variant="secondary" className="text-xs">
                {getFileTypeBadge(file.contentType)}
              </Badge>
              {file.url && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  asChild
                  onClick={(e) => e.stopPropagation()}
                >
                  <a
                    href={file.url}
                    download={file.fileName}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download className="h-3 w-3" />
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
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

      {/* Student Link Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <LinkIcon className="h-5 w-5" />
            Student Link
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Share this link with students to access the assignment materials.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono break-all">
              {studentLink}
            </code>
            <Button variant="outline" size="icon" onClick={handleCopyLink}>
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button variant="outline" size="icon" asChild>
              <a href={studentLink} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Files Section - Two Columns */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Assignment Files */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">
            Assignment Files ({assignment.assignmentFiles.length})
          </h2>
          {renderFileList(assignment.assignmentFiles)}
        </div>

        {/* Notes Files */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">
            Notes Files ({assignment.notesFiles.length})
          </h2>
          {renderFileList(assignment.notesFiles)}
        </div>
      </div>

      {/* Additional Information Section */}
      {assignment.additionalInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Info className="h-5 w-5" />
              Additional Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">
              {assignment.additionalInfo}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Questions Review Section */}
      {(() => {
        const allQuestions = questions || [];
        const isProcessing = assignment.processingStatus === "extracting" ||
                            assignment.processingStatus === "generating_answers";
        const completedQuestions = allQuestions.filter(
          (q) => q.status === "ready" || q.status === "approved"
        );

        // Show section if processing or has questions
        if (!isProcessing && allQuestions.length === 0) return null;

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                Questions {allQuestions.length > 0 && `(${allQuestions.length})`}
              </h2>
              <div className="flex items-center gap-2">
                {isProcessing && (
                  <Badge variant="secondary" className="text-xs">
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    {assignment.processingStatus === "extracting" ? "Extracting questions..." : "Generating answers..."}
                  </Badge>
                )}
                {(() => {
                  const readyCount = completedQuestions.filter(
                    (q) => q.status === "ready"
                  ).length;
                  const webSourcedCount = completedQuestions.filter(
                    (q) => q.source && Array.isArray(q.source)
                  ).length;
                  const approvedCount = completedQuestions.filter(
                    (q) => q.status === "approved"
                  ).length;
                  if (completedQuestions.length === 0) return null;
                  return (
                    <>
                      {webSourcedCount > 0 && (
                        <span className="text-sm text-amber-600 dark:text-amber-400">
                          {webSourcedCount} manual review recommended
                        </span>
                      )}
                      <span className="text-sm text-muted-foreground">
                        {approvedCount}/{completedQuestions.length} approved
                      </span>
                      {readyCount > 0 && (
                        <Button
                          size="sm"
                          onClick={handleApproveAll}
                          disabled={isApprovingAll}
                        >
                          {isApprovingAll ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <CheckCheck className="h-4 w-4 mr-1" />
                          )}
                          Approve All ({readyCount})
                        </Button>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Processing indicator when no questions yet */}
            {isProcessing && allQuestions.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    {assignment.processingStatus === "extracting"
                      ? "Extracting questions from assignment files..."
                      : "Generating answers from notes..."}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Questions list */}
            {allQuestions.length > 0 && (
              <div className="space-y-3">
                {allQuestions
                  .sort((a, b) => a.questionNumber - b.questionNumber)
                  .map((question) => (
                    <QuestionReviewCard
                      key={question._id}
                      question={question}
                      onEdit={(q) => setEditingQuestion(q)}
                    />
                  ))}
              </div>
            )}
          </div>
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
        <DialogContent className="!max-w-none flex flex-col" style={{ width: "80vw", height: "85vh" }}>
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
