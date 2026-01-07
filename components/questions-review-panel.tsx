"use client";

import { useEffect, useState } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Check,
  Pencil,
  MessageSquare,
  Trash2,
  ChevronDown,
  FastForward,
  Loader2,
  ExternalLink,
  Send,
  CheckCheck,
  AlertTriangle,
  AlertCircle,
  Undo2,
  XCircle,
} from "lucide-react";
import { useResizablePanel } from "@/hooks/use-resizable-panel";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ReviewQuestion } from "@/lib/types";

interface QuestionsReviewPanelProps {
  questions: ReviewQuestion[];
  assignmentId: Id<"assignments">;
  isProcessing: boolean;
  processingStatus?: string;
  onEdit: (question: ReviewQuestion) => void;
  headerActions?: React.ReactNode;
}

export function QuestionsReviewPanel({
  questions,
  assignmentId,
  isProcessing,
  processingStatus,
  onEdit,
  headerActions,
}: QuestionsReviewPanelProps) {
  const [selectedQuestionId, setSelectedQuestionId] =
    useState<Id<"questions"> | null>(
      questions.length > 0 ? questions[0]._id : null,
    );
  const [isApproving, setIsApproving] = useState(false);
  const [isApprovingAll, setIsApprovingAll] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [regenQueue, setRegenQueue] = useState<
    Array<{ questionId: Id<"questions">; feedback?: string }>
  >([]);
  const [currentRegenId, setCurrentRegenId] =
    useState<Id<"questions"> | null>(null);
  const [changeRequest, setChangeRequest] = useState("");
  const [changePopoverOpen, setChangePopoverOpen] = useState(false);

  // Resizable panels
  const { containerRef, leftPanelWidth, handleMouseDown } = useResizablePanel({
    defaultSize: 40,
    minSize: 25,
    maxSize: 60,
  });

  const approveQuestion = useMutation(api.questions.approveQuestion);
  const unapproveQuestion = useMutation(api.questions.unapproveQuestion);
  const approveAllQuestions = useMutation(api.questions.approveAllQuestions);
  const removeQuestion = useMutation(api.questions.removeQuestion);
  const regenerateAnswer = useAction(api.answerGeneration.regenerateAnswer);

  const sortedQuestions = [...questions].sort(
    (a, b) => a.extractionOrder - b.extractionOrder,
  );
  const selectedQuestion =
    sortedQuestions.find((q) => q._id === selectedQuestionId) || null;

  // Stats
  const skippedQuestions = sortedQuestions.filter(
    (q) => q.questionType === "skipped",
  );
  const skippedCount = skippedQuestions.length;
  // Questions currently being processed
  const processingQuestions = sortedQuestions.filter(
    (q) =>
      (q.status === "pending" || q.status === "processing") &&
      q.questionType !== "skipped",
  );
  const processingCount = processingQuestions.length;
  const currentProcessingId =
    isProcessing &&
    (sortedQuestions.find((q) => q.status === "processing")?._id || null);
  // Exclude skipped from completed questions count
  const completedQuestions = sortedQuestions.filter(
    (q) =>
      (q.status === "ready" || q.status === "approved") &&
      q.questionType !== "skipped",
  );
  const readyNotesOnly = completedQuestions.filter(
    (q) => q.status === "ready" && q.source === "notes",
  );
  const readyAll = completedQuestions.filter((q) => q.status === "ready");
  // Count only unapproved web-sourced questions
  const unapprovedWebSourced = completedQuestions.filter(
    (q) => q.source && Array.isArray(q.source) && q.status !== "approved",
  );
  const approvedCount = completedQuestions.filter(
    (q) => q.status === "approved",
  ).length;
  // Total questions that need answers (excluding skipped)
  const totalAnswerable = sortedQuestions.filter(
    (q) => q.questionType !== "skipped",
  ).length;

  // Select first question when questions change and none selected
  if (!selectedQuestion && sortedQuestions.length > 0) {
    setSelectedQuestionId(sortedQuestions[0]._id);
  }

  const getQuestionStatus = (question: ReviewQuestion) => {
    const status =
      !isProcessing && question.status === "processing"
        ? "ready"
        : question.status;

    if (question.questionType === "skipped") return "skipped";
    if (status === "approved") return "approved";
    if (status === "pending" || status === "processing") {
      // If nothing is processing globally, treat lingering processing as ready
      return isProcessing ? status : "ready";
    }
    if (question.source && Array.isArray(question.source))
      return "needs_review";
    return "ready";
  };

  const handleApprove = async () => {
    if (!selectedQuestion) return;
    setIsApproving(true);
    try {
      await approveQuestion({ questionId: selectedQuestion._id });
      toast.success("Question approved");
    } catch {
      toast.error("Failed to approve question");
    } finally {
      setIsApproving(false);
    }
  };

  const handleUnapprove = async () => {
    if (!selectedQuestion) return;
    setIsApproving(true);
    try {
      await unapproveQuestion({ questionId: selectedQuestion._id });
      toast.success("Approval removed");
    } catch {
      toast.error("Failed to remove approval");
    } finally {
      setIsApproving(false);
    }
  };

  const handleApproveNotesOnly = async () => {
    setIsApprovingAll(true);
    try {
      const result = await approveAllQuestions({
        assignmentId,
        notesOnly: true,
      });
      toast.success(`Approved ${result.approved} questions`);
    } catch {
      toast.error("Failed to approve questions");
    } finally {
      setIsApprovingAll(false);
    }
  };

  const handleApproveAll = async () => {
    setIsApprovingAll(true);
    try {
      const result = await approveAllQuestions({ assignmentId });
      toast.success(`Approved ${result.approved} questions`);
    } catch {
      toast.error("Failed to approve questions");
    } finally {
      setIsApprovingAll(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!selectedQuestion) return;
    setChangePopoverOpen(false);
    const feedback = changeRequest.trim() || undefined;
    setChangeRequest("");

    let enqueuePosition = 0;
    setRegenQueue((prev) => {
      if (
        prev.some((item) => item.questionId === selectedQuestion._id) ||
        currentRegenId === selectedQuestion._id
      ) {
        enqueuePosition = -1;
        return prev;
      }
      const next = [...prev, { questionId: selectedQuestion._id, feedback }];
      enqueuePosition = next.length;
      return next;
    });

    if (enqueuePosition === -1) {
      toast("Already regenerating this question");
    } else if (enqueuePosition > 1 || isRegenerating || currentRegenId) {
      toast.success(`Queued regeneration (#${enqueuePosition})`);
    }
  };

  // Process queued regenerations sequentially
  useEffect(() => {
    if (isRegenerating || regenQueue.length === 0) return;

    const next = regenQueue[0];
    const run = async () => {
      setIsRegenerating(true);
      setCurrentRegenId(next.questionId);
      try {
        const result = await regenerateAnswer({
          questionId: next.questionId,
          feedback: next.feedback,
        });
        if (result.success) {
          toast.success("Answer regenerated");
        } else {
          toast.error(result.error || "Failed to update answer");
        }
      } catch {
        toast.error("Failed to request changes");
      } finally {
        setRegenQueue((prev) => prev.slice(1));
        setIsRegenerating(false);
        setCurrentRegenId(null);
      }
    };

    void run();
  }, [isRegenerating, regenQueue, regenerateAnswer]);

  const handleRemove = async () => {
    if (!selectedQuestion) return;
    setIsRemoving(true);
    try {
      await removeQuestion({ questionId: selectedQuestion._id });
      toast.success("Question removed");
      // Select next question
      const currentIndex = sortedQuestions.findIndex(
        (q) => q._id === selectedQuestion._id,
      );
      const nextQuestion =
        sortedQuestions[currentIndex + 1] || sortedQuestions[currentIndex - 1];
      setSelectedQuestionId(nextQuestion?._id || null);
    } catch {
      toast.error("Failed to remove question");
    } finally {
      setIsRemoving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedQuestion) return;
    setIsRejecting(true);
    try {
      await unapproveQuestion({ questionId: selectedQuestion._id });
      toast.success("Approval removed");
    } catch {
      toast.error("Failed to remove approval");
    } finally {
      setIsRejecting(false);
    }
  };

  const navigateToFirstWebSourced = () => {
    if (unapprovedWebSourced.length > 0) {
      setSelectedQuestionId(unapprovedWebSourced[0]._id);
    }
  };

  const formatAnswer = (answer: string | string[] | undefined) => {
    if (!answer) return "No answer generated";
    if (Array.isArray(answer)) {
      return answer.map((point, i) => `${i + 1}. ${point}`).join("\n");
    }
    return answer;
  };

  const typeLabels: Record<string, string> = {
    multiple_choice: "Multiple Choice",
    single_value: "Single Value",
    short_answer: "Short Answer",
    free_response: "Free Response",
    skipped: "Skipped",
  };
  const statusStyles: Record<
    string,
    {
      label: string;
      badgeClass: string;
      rowClass?: string;
    }
  > = {
    approved: {
      label: "Approved",
      badgeClass:
        "bg-green-100 text-green-800 border border-green-300 dark:bg-green-900/40 dark:text-green-100 dark:border-green-800",
      rowClass: "bg-green-100/80 dark:bg-green-900/30",
    },
    needs_review: {
      label: "Needs review",
      badgeClass:
        "bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-100 dark:border-amber-800",
      rowClass: "bg-amber-100/80 dark:bg-amber-900/30",
    },
    skipped: {
      label: "Skipped",
      badgeClass:
        "bg-red-100 text-red-800 border border-red-300 dark:bg-red-900/40 dark:text-red-100 dark:border-red-800",
      rowClass: "bg-red-100/80 dark:bg-red-900/30",
    },
    processing: {
      label: "Processing",
      badgeClass:
        "bg-slate-400 text-slate-950 border border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:border-slate-700",
      rowClass: "bg-slate-300/90 dark:bg-slate-900/60",
    },
    ready: {
      label: "Answer ready",
      badgeClass:
        "bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800/50 dark:text-slate-100 dark:border-slate-700",
      rowClass: "bg-slate-50 dark:bg-slate-950/30",
    },
    pending: {
      label: "Pending",
      badgeClass:
        "bg-slate-400 text-slate-950 border border-slate-600 dark:bg-slate-900 dark:text-slate-50 dark:border-slate-800",
      rowClass: "bg-slate-400/70 dark:bg-slate-900/75",
    },
  };

  // No questions state
  if (sortedQuestions.length === 0) {
    if (isProcessing) {
      return (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {processingStatus === "extracting"
                ? "Extracting questions from assignment files..."
                : "Generating answers from notes..."}
            </p>
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  const selectedStatus =
    !isProcessing && selectedQuestion?.status === "processing"
      ? "ready"
      : selectedQuestion?.status;
  const isPending =
    selectedStatus === "pending" || selectedStatus === "processing";
  const isApprovedQuestion = selectedQuestion?.status === "approved";
  const isSkipped = selectedQuestion?.questionType === "skipped";
  const isWebSource =
    selectedQuestion?.source && Array.isArray(selectedQuestion.source);
  const hasUnapprovedWebSources = unapprovedWebSourced.length > 0;
  const isCurrentRegenerating = selectedQuestion
    ? currentRegenId === selectedQuestion._id
    : false;
  const isQueuedForSelected = selectedQuestion
    ? isCurrentRegenerating ||
      regenQueue.some((item) => item.questionId === selectedQuestion._id)
    : false;

  return (
    <div className="space-y-0.5 min-w-0 w-full max-w-full overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap pb-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <h2 className="text-xl font-semibold shrink-0 leading-tight">
            Questions ({sortedQuestions.length})
          </h2>
          <span className="text-sm text-muted-foreground leading-tight">
            {approvedCount}/{completedQuestions.length} Accepted
            {skippedCount > 0 && ` (${skippedCount} skipped)`}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isProcessing && (
            <Badge variant="secondary" className="text-xs">
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              {processingStatus === "extracting"
                ? "Extracting questions..."
                : processingCount > 0
                  ? `Generating ${completedQuestions.length}/${totalAnswerable}...`
                  : "Generating answers..."}
            </Badge>
          )}
          {headerActions && (
            <div className="flex items-center gap-2">{headerActions}</div>
          )}

          {completedQuestions.length > 0 && (
            <div className="flex">
              {readyAll.length === 0 && !hasUnapprovedWebSources ? (
                <Button
                  size="sm"
                  disabled
                  variant="outline"
                  className="text-green-600 border-green-600/30 bg-green-50 dark:bg-green-950/20"
                >
                  <Check className="h-4 w-4 mr-1" />
                  All Approved!
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    onClick={
                      hasUnapprovedWebSources
                        ? navigateToFirstWebSourced
                        : handleApproveNotesOnly
                    }
                    disabled={
                      !hasUnapprovedWebSources &&
                      (isApprovingAll || readyNotesOnly.length === 0)
                    }
                    className={cn(
                      "rounded-r-none",
                      hasUnapprovedWebSources &&
                        "bg-amber-500 hover:bg-amber-600",
                    )}
                  >
                    {isApprovingAll ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : hasUnapprovedWebSources ? (
                      <>
                        <AlertTriangle className="h-4 w-4 mr-1" />
                        Review Outside Sources ({unapprovedWebSourced.length})
                      </>
                    ) : (
                      <>
                        <CheckCheck className="h-4 w-4 mr-1" />
                        Approve from Notes ({readyNotesOnly.length})
                      </>
                    )}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        className={cn(
                          "rounded-l-none border-l border-primary-foreground/20 px-1.5",
                          hasUnapprovedWebSources &&
                            "bg-amber-500 hover:bg-amber-600",
                        )}
                        disabled={isApprovingAll}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[220px]">
                      <DropdownMenuItem
                        onClick={handleApproveNotesOnly}
                        disabled={readyNotesOnly.length === 0}
                        className="gap-2"
                      >
                        <CheckCheck className="h-4 w-4" />
                        <span>
                          Approve from Notes ({readyNotesOnly.length})
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleApproveAll}
                        disabled={readyAll.length === 0}
                        className="gap-2"
                      >
                        <CheckCheck className="h-4 w-4" />
                        <span>Approve All incl. Web ({readyAll.length})</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="pt-0" />

      {/* Split Panel with Card wrapper */}
      <Card className="!py-0 overflow-hidden w-full max-w-full border-0 shadow-none !rounded-none !ring-0 !ring-offset-0">
        <CardContent className="!p-0 overflow-hidden w-full max-w-full !rounded-none">
          <div
            ref={containerRef}
            className="flex h-[500px] overflow-hidden w-full max-w-full"
          >
            {/* Left: Question List */}
            <div
              className="overflow-hidden min-w-0 rounded-l-xl bg-background"
              style={{ width: `${leftPanelWidth}%` }}
            >
              <ScrollArea className="h-full rounded-l-xl">
                <div className="space-y-0">
                  {sortedQuestions.map((question) => {
                    const status = getQuestionStatus(question);
                    const isSelected = question._id === selectedQuestionId;
                    const statusStyle = statusStyles[status];
                    const isActiveProcessing =
                      isProcessing &&
                      question.status === "processing" &&
                      currentProcessingId === question._id;
                    return (
                      <div
                        key={question._id}
                        onClick={() => setSelectedQuestionId(question._id)}
                        className={cn(
                          "cursor-pointer transition-colors flex items-center justify-between px-3 py-2 rounded-none first:rounded-tl-xl last:rounded-bl-xl",
                          statusStyle?.rowClass,
                          isSelected &&
                            "ring-2 ring-inset ring-black/50 dark:ring-white/60",
                          isActiveProcessing &&
                            "ring-2 ring-inset ring-primary/60 bg-primary/5 dark:bg-primary/10",
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium text-sm shrink-0">
                            Q{question.questionNumber}:
                          </span>
                          <span className="text-sm text-muted-foreground truncate">
                            {question.questionText}
                          </span>
                        </div>
                        <div className="shrink-0 ml-2 flex items-center gap-2">
                          {statusStyle && (
                            <span
                              className={cn(
                                "text-[11px] font-medium px-2 py-0.5 rounded-full",
                                statusStyle.badgeClass,
                              )}
                            >
                              {statusStyle.label}
                            </span>
                          )}
                          {status === "approved" && (
                            <Check className="h-4 w-4 text-green-600" />
                          )}
                          {status === "needs_review" && (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          )}
                          {status === "skipped" && (
                            <FastForward
                              className="h-4 w-4 text-slate-400"
                              fill="currentColor"
                              strokeWidth={0}
                            />
                          )}
                          {/* No explicit icon for processing */}
                          {/* No icon for "ready" status */}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* Draggable Divider */}
            <div
              onMouseDown={handleMouseDown}
              className="w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors shrink-0 relative group"
            >
              <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-primary/10" />
            </div>

            {/* Right: Question Detail */}
            <div
              className="overflow-hidden min-w-0"
              style={{ width: `${100 - leftPanelWidth}%` }}
            >
              {selectedQuestion ? (
                <ScrollArea className="h-full [&>div>div]:!block">
                  <div className="p-4 space-y-4 max-w-full overflow-hidden">
                    {/* Question Header with Delete icon top right */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-lg">
                            Q{selectedQuestion.questionNumber}
                          </span>
                          {!isSkipped && (
                            <Badge variant="outline" className="text-xs">
                              {typeLabels[selectedQuestion.questionType] ||
                                selectedQuestion.questionType}
                            </Badge>
                          )}
                          {/* Processing badge removed to avoid stale display */}
                          {isApprovedQuestion && (
                            <Badge className="text-xs bg-green-600">
                              <Check className="h-3 w-3 mr-1" />
                              Approved
                            </Badge>
                          )}
                          {isWebSource && !isApprovedQuestion && !isSkipped && (
                            <Badge
                              variant="outline"
                              className="text-xs border-amber-500 text-amber-700 dark:text-amber-400"
                            >
                              Needs Review
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Right side: Approve/Undo + Delete */}
                      <div className="flex items-center gap-1">
                        {!isPending &&
                          !isSkipped &&
                          (isApprovedQuestion ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleUnapprove}
                              disabled={isApproving}
                              className="h-7 text-xs"
                            >
                              {isApproving ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <Undo2 className="h-3 w-3 mr-1" />
                                  Undo
                                </>
                              )}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={handleApprove}
                              disabled={isApproving}
                              className="h-7 text-xs"
                            >
                              {isApproving ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "Approve"
                              )}
                            </Button>
                          ))}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={handleRemove}
                          disabled={isRemoving}
                        >
                          {isRemoving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Question Text */}
                    <p className="text-base break-words">
                      {selectedQuestion.questionText}
                    </p>

                    {/* Answer Choices for Multiple Choice */}
                    {selectedQuestion.questionType === "multiple_choice" &&
                      selectedQuestion.answerOptionsMCQ &&
                      selectedQuestion.answerOptionsMCQ.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-xs font-medium text-muted-foreground">
                            Answer Choices
                          </div>
                          <div className="space-y-1">
                            {selectedQuestion.answerOptionsMCQ.map(
                              (option, i) => {
                                const optionLetter = String.fromCharCode(
                                  65 + i,
                                );
                                const isCorrectAnswer =
                                  !isPending &&
                                  selectedQuestion.answer &&
                                  typeof selectedQuestion.answer === "string" &&
                                  selectedQuestion.answer
                                    .toUpperCase()
                                    .trim() === optionLetter;
                                return (
                                  <div
                                    key={i}
                                    className={cn(
                                      "text-sm pl-2 py-1 rounded-md transition-colors",
                                      isCorrectAnswer
                                        ? isApprovedQuestion
                                          ? "bg-green-100 dark:bg-green-950/50 border border-green-500 text-green-800 dark:text-green-300 font-medium"
                                          : isWebSource
                                            ? "bg-amber-100 dark:bg-amber-950/50 border border-amber-500 text-amber-800 dark:text-amber-300 font-medium"
                                            : "bg-blue-100 dark:bg-blue-950/50 border border-blue-500 text-blue-800 dark:text-blue-300 font-medium"
                                        : "text-muted-foreground",
                                    )}
                                  >
                                    {optionLetter}. {option}
                                    {isCorrectAnswer && (
                                      <Check className="inline-block h-4 w-4 ml-2" />
                                    )}
                                  </div>
                                );
                              },
                            )}
                          </div>
                        </div>
                      )}

                    {/* Skipped Question Message */}
                    {isSkipped && (
                      <div className="flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-slate-900 px-4 py-3 text-slate-600 dark:text-slate-400">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span className="text-sm">
                          You marked this question to be skipped
                        </span>
                      </div>
                    )}

                    {/* Answer - show for all types, but for MCQ only if answer isn't a valid option letter */}
                    {!isPending &&
                      !isSkipped &&
                      (() => {
                        // For MCQ, check if the answer is a valid option letter
                        const isMCQ =
                          selectedQuestion.questionType === "multiple_choice";
                        const hasOptions =
                          selectedQuestion.answerOptionsMCQ &&
                          selectedQuestion.answerOptionsMCQ.length > 0;
                        const answer =
                          typeof selectedQuestion.answer === "string"
                            ? selectedQuestion.answer.toUpperCase().trim()
                            : "";
                        const isValidLetter =
                          hasOptions && /^[A-D]$/.test(answer);
                        // Show answer box if NOT (MCQ with options AND valid letter answer)
                        return !(isMCQ && hasOptions && isValidLetter);
                      })() && (
                        <div
                          className={cn(
                            "rounded-lg px-4 py-3 overflow-hidden",
                            isWebSource && !isApprovedQuestion
                              ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900"
                              : isApprovedQuestion
                                ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900"
                                : "bg-muted/50",
                          )}
                        >
                          <div className="text-xs font-medium text-muted-foreground mb-1">
                            Answer
                          </div>
                          <div className="whitespace-pre-wrap break-words">
                            {formatAnswer(selectedQuestion.answer)}
                          </div>
                        </div>
                      )}

                    {/* Source below answer */}
                    {selectedQuestion.source && !isPending && !isSkipped && (
                      <div className="flex items-start gap-2 text-sm overflow-hidden">
                        <span className="text-muted-foreground shrink-0">
                          Source:
                        </span>
                        {selectedQuestion.source === "notes" ? (
                          <span className="text-green-600 dark:text-green-400 font-medium">
                            Notes
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-2 min-w-0 overflow-hidden">
                            {(selectedQuestion.source as string[]).map(
                              (url, i) => (
                                <a
                                  key={i}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-amber-600 hover:underline inline-flex items-center gap-1 truncate max-w-[200px]"
                                  title={url}
                                >
                                  {new URL(url).hostname}
                                  <ExternalLink className="h-3 w-3 shrink-0" />
                                </a>
                              ),
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Key Points */}
                    {selectedQuestion.keyPoints &&
                      selectedQuestion.keyPoints.length > 0 &&
                      !isPending &&
                      !isSkipped && (
                        <details className="group" open>
                          <summary className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer list-none">
                            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-0 -rotate-90" />
                            Key Points ({selectedQuestion.keyPoints.length})
                          </summary>
                          <div className="mt-2 space-y-2 pl-6 overflow-hidden">
                            {selectedQuestion.keyPoints.map((keyPoint, i) => (
                              <div
                                key={i}
                                className="text-sm bg-muted rounded-md px-3 py-2 italic border-l-2 border-primary/30 break-words"
                              >
                                &ldquo;{keyPoint}&rdquo;
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                    {/* Actions - show for all non-pending questions including skipped */}
                    {!isPending && (
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                        {!isSkipped && (
                          <Button
                            size="sm"
                            onClick={handleApprove}
                            disabled={isApproving || isApprovedQuestion}
                            className="gap-1"
                          >
                            {isApproving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : isApprovedQuestion ? (
                              <>
                                <Check className="h-4 w-4" />
                                Approved
                              </>
                            ) : (
                              <>
                                <Check className="h-4 w-4" />
                                Approve
                              </>
                            )}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={handleReject}
                          disabled={isRejecting || isSkipped || !isApprovedQuestion}
                          className="gap-1"
                        >
                          {isRejecting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isSkipped ? (
                            <>
                              <XCircle className="h-4 w-4" />
                              Rejected
                            </>
                          ) : (
                            <>
                              <XCircle className="h-4 w-4" />
                              Reject
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onEdit(selectedQuestion)}
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                        <Popover
                          open={changePopoverOpen}
                          onOpenChange={setChangePopoverOpen}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!!isQueuedForSelected}
                            >
                              {isCurrentRegenerating ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MessageSquare className="h-4 w-4" />
                              )}
                              {isCurrentRegenerating
                                ? "Regenerating..."
                                : isQueuedForSelected
                                  ? "Queued"
                                  : isSkipped
                                    ? "Generate"
                                    : "Regenerate"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64" align="start">
                            <div className="space-y-3">
                              <p className="text-sm font-medium">
                                {isSkipped ? "Generate Answer" : "Regenerate"}
                              </p>
                              <Textarea
                                placeholder={
                                  isSkipped
                                    ? "Describe what answer you want generated... (optional)"
                                    : "Optional notes for regeneration..."
                                }
                                value={changeRequest}
                                onChange={(e) =>
                                  setChangeRequest(e.target.value)
                                }
                                rows={3}
                              />
                              <Button
                                size="sm"
                                onClick={handleRequestChanges}
                                className="w-full"
                                disabled={!!isQueuedForSelected}
                              >
                                <Send className="h-4 w-4" />
                                {isQueuedForSelected ? "Queued" : "Regenerate"}
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Select a question to view details
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
