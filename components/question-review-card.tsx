"use client";

import { useState } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Check,
  Pencil,
  MessageSquare,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  ExternalLink,
  Send,
} from "lucide-react";
import { toast } from "sonner";

type Question = {
  _id: Id<"questions">;
  questionNumber: number;
  questionText: string;
  questionType: string;
  answer?: string | string[];
  snippets?: string[];
  source?: "notes" | string[];
  status: "pending" | "processing" | "ready" | "approved";
};

interface QuestionReviewCardProps {
  question: Question;
  onEdit: (question: Question) => void;
}

export function QuestionReviewCard({ question, onEdit }: QuestionReviewCardProps) {
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [changeRequest, setChangeRequest] = useState("");
  const [changePopoverOpen, setChangePopoverOpen] = useState(false);

  const approveQuestion = useMutation(api.questions.approveQuestion);
  const removeQuestion = useMutation(api.questions.removeQuestion);
  const regenerateAnswer = useAction(api.answerGeneration.regenerateAnswer);

  const isWebSource = question.source && Array.isArray(question.source);
  const isPending = question.status === "pending" || question.status === "processing";
  const isApproved = question.status === "approved";

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await approveQuestion({ questionId: question._id });
      toast.success("Question approved");
    } catch {
      toast.error("Failed to approve question");
    } finally {
      setIsApproving(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!changeRequest.trim()) {
      toast.error("Please describe what changes you want");
      return;
    }
    setIsRegenerating(true);
    setChangePopoverOpen(false);
    try {
      const result = await regenerateAnswer({
        questionId: question._id,
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
    setIsRemoving(true);
    try {
      await removeQuestion({ questionId: question._id });
      toast.success("Question removed");
    } catch {
      toast.error("Failed to remove question");
    } finally {
      setIsRemoving(false);
    }
  };

  // Format answer for display
  const formatAnswer = (answer: string | string[] | undefined) => {
    if (!answer) return "No answer generated";
    if (Array.isArray(answer)) {
      return answer.map((point, i) => `${i + 1}. ${point}`).join("\n");
    }
    return answer;
  };

  // Question type display
  const typeLabels: Record<string, string> = {
    multiple_choice: "Multiple Choice",
    single_number: "Number",
    short_answer: "Short Answer",
    free_response: "Free Response",
    skipped: "Skipped",
  };

  return (
    <Card
      className={`transition-all ${
        isWebSource && !isApproved
          ? "border-amber-400 bg-amber-50/50 dark:bg-amber-950/20"
          : isApproved
            ? "border-green-400 bg-green-50/50 dark:bg-green-950/20"
            : ""
      } ${isPending ? "opacity-60" : ""}`}
    >
      <CardContent className="px-3 py-2 space-y-2">
        {/* Header: Question number, text, type badge on right */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">Q{question.questionNumber}:</span>
              {isPending && (
                <Badge variant="secondary" className="text-xs">
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  Processing
                </Badge>
              )}
              {isApproved && (
                <Badge className="text-xs bg-green-600">
                  <Check className="h-3 w-3 mr-1" />
                  Approved
                </Badge>
              )}
              {isWebSource && !isApproved && (
                <Badge variant="outline" className="text-xs border-amber-500 text-amber-700 dark:text-amber-400">
                  Needs Review
                </Badge>
              )}
            </div>
            <p className="mt-1">{question.questionText}</p>
          </div>
          <Badge variant="outline" className="text-xs shrink-0">
            {typeLabels[question.questionType] || question.questionType}
          </Badge>
        </div>

        {/* Answer */}
        {!isPending && (
          <div className="bg-muted/50 rounded-md px-3 py-2">
            <div className="text-xs text-muted-foreground mb-0.5">Answer:</div>
            <div className="font-medium whitespace-pre-wrap">{formatAnswer(question.answer)}</div>
          </div>
        )}

        {/* Source & Snippets inline */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {question.source && (
            <div className="flex items-center gap-1">
              <span>Source:</span>
              {question.source === "notes" ? (
                <span className="text-green-600 dark:text-green-400">Notes</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {(question.source as string[]).map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-600 hover:underline inline-flex items-center gap-0.5"
                    >
                      {new URL(url).hostname}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
          {question.snippets && question.snippets.length > 0 && (
            <Collapsible open={snippetsOpen} onOpenChange={setSnippetsOpen}>
              <CollapsibleTrigger className="flex items-center gap-1 hover:text-foreground">
                {snippetsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Snippets ({question.snippets.length})
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-1">
                {question.snippets.map((snippet, i) => (
                  <div key={i} className="text-sm bg-muted rounded px-2 py-1 italic">&ldquo;{snippet}&rdquo;</div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>

        {/* Actions */}
        {!isPending && (
          <div className="flex items-center gap-2">
            {!isApproved && (
              <Button size="sm" variant="default" onClick={handleApprove} disabled={isApproving} className="h-7">
                {isApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Approve
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => onEdit(question)} className="h-7">
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <Popover open={changePopoverOpen} onOpenChange={setChangePopoverOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" disabled={isRegenerating} className="h-7">
                  {isRegenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                  Request Changes
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="start">
                <div className="space-y-3">
                  <p className="text-sm font-medium">Request Changes</p>
                  <Textarea
                    placeholder="e.g., Include more detail, fix the calculation..."
                    value={changeRequest}
                    onChange={(e) => setChangeRequest(e.target.value)}
                    rows={3}
                  />
                  <Button size="sm" onClick={handleRequestChanges} disabled={!changeRequest.trim()} className="w-full">
                    <Send className="h-4 w-4" />
                    Send to AI
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRemove}
              disabled={isRemoving}
              className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
