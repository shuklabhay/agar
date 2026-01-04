"use client";

import { useState } from "react";
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
}

export function QuestionsReviewPanel({
  questions,
  assignmentId,
  isProcessing,
  processingStatus,
  onEdit,
}: QuestionsReviewPanelProps) {
  const [selectedQuestionId, setSelectedQuestionId] =
    useState<Id<"questions"> | null>(
      questions.length > 0 ? questions[0]._id : null,
    );
  const [isApproving, setIsApproving] = useState(false);
  const [isApprovingAll, setIsApprovingAll] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
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
    if (question.questionType === "skipped") return "skipped";
    if (question.status === "approved") return "approved";
    if (question.status === "pending" || question.status === "processing")
      return "processing";
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
    if (!selectedQuestion || !changeRequest.trim()) {
      toast.error("Please describe what changes you want");
      return;
    }
    setIsRegenerating(true);
    setChangePopoverOpen(false);
    try {
      const result = await regenerateAnswer({
        questionId: selectedQuestion._id,
        feedback: changeRequest.trim(),
      });
      if (result.success) {
        toast.success("Answer updated based on your feedback");
        setChangeRequest("");
      } else {
        toast.error(result.error || "Failed to update answer");
      }
    } catch {
      toast.error("Failed to request changes");
    } finally {
      setIsRegenerating(false);
    }
  };

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

  const isPending =
    selectedQuestion?.status === "pending" ||
    selectedQuestion?.status === "processing";
  const isApprovedQuestion = selectedQuestion?.status === "approved";
  const isSkipped = selectedQuestion?.questionType === "skipped";
  const isWebSource =
    selectedQuestion?.source && Array.isArray(selectedQuestion.source);
  const hasUnapprovedWebSources = unapprovedWebSourced.length > 0;

  return (
    <div className="space-y-4 min-w-0 w-full max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-semibold shrink-0">
          Questions ({sortedQuestions.length})
        </h2>
        <div className="flex items-center gap-3">
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
          <span className="text-sm text-muted-foreground">
            {processingCount > 0 && !isProcessing ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                {completedQuestions.length}/{totalAnswerable} generated
              </>
            ) : (
              <>
                {approvedCount}/{completedQuestions.length} approved
                {skippedCount > 0 && ` (${skippedCount} skipped)`}
              </>
            )}
          </span>
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

      {/* Split Panel with Card wrapper */}
      <Card className="!py-0 overflow-hidden w-full max-w-full">
        <CardContent className="!p-0 overflow-hidden w-full max-w-full">
          <div ref={containerRef} className="flex h-[500px] overflow-hidden w-full max-w-full">
            {/* Left: Question List */}
            <div
              className="overflow-hidden min-w-0"
              style={{ width: `${leftPanelWidth}%` }}
            >
              <ScrollArea className="h-full">
                <div className="divide-y">
                  {sortedQuestions.map((question) => {
                    const status = getQuestionStatus(question);
                    const isSelected = question._id === selectedQuestionId;
                    return (
                      <div
                        key={question._id}
                        onClick={() => setSelectedQuestionId(question._id)}
                        className={cn(
                          "cursor-pointer transition-colors flex items-center justify-between px-3 py-2",
                          isSelected ? "bg-muted" : "hover:bg-muted/50",
                          status === "processing" && "opacity-60",
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
                        <div className="shrink-0 ml-2">
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
                          {status === "processing" && (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          )}
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
                          {isPending && (
                            <Badge variant="secondary" className="text-xs">
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              Processing
                            </Badge>
                          )}
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
                    <p className="text-base break-words">{selectedQuestion.questionText}</p>

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
                                const optionLetter = String.fromCharCode(65 + i);
                                const isCorrectAnswer =
                                  !isPending &&
                                  selectedQuestion.answer &&
                                  typeof selectedQuestion.answer === "string" &&
                                  selectedQuestion.answer.toUpperCase().trim() === optionLetter;
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
                                        : "text-muted-foreground"
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

                    {/* Source - shown above answer */}
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

                    {/* Answer - show for all types, but for MCQ only if answer isn't a valid option letter */}
                    {!isPending &&
                      !isSkipped &&
                      (() => {
                        // For MCQ, check if the answer is a valid option letter
                        const isMCQ = selectedQuestion.questionType === "multiple_choice";
                        const hasOptions = selectedQuestion.answerOptionsMCQ && selectedQuestion.answerOptionsMCQ.length > 0;
                        const answer = typeof selectedQuestion.answer === "string" ? selectedQuestion.answer.toUpperCase().trim() : "";
                        const isValidLetter = hasOptions && /^[A-D]$/.test(answer);
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

                    {/* Key Points */}
                    {selectedQuestion.keyPoints &&
                      selectedQuestion.keyPoints.length > 0 &&
                      !isPending &&
                      !isSkipped && (
                        <details className="group">
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
                      <div className="flex items-center gap-2 pt-2 border-t">
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
                              disabled={isRegenerating}
                            >
                              {isRegenerating ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MessageSquare className="h-4 w-4" />
                              )}
                              {isSkipped ? "Generate" : "Request Changes"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80" align="start">
                            <div className="space-y-3">
                              <p className="text-sm font-medium">
                                {isSkipped
                                  ? "Generate Answer"
                                  : "Request Changes"}
                              </p>
                              <Textarea
                                placeholder={
                                  isSkipped
                                    ? "Describe what answer you want generated..."
                                    : "e.g., Include more detail, fix the calculation..."
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
                                disabled={!changeRequest.trim()}
                                className="w-full"
                              >
                                <Send className="h-4 w-4" />
                                Send to AI
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
