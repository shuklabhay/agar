"use client";

import { useState } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Check,
  Pencil,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  ExternalLink,
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
    } catch (error) {
      toast.error("Failed to approve question");
    } finally {
      setIsApproving(false);
    }
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      const result = await regenerateAnswer({ questionId: question._id });
      if (result.success) {
        toast.success("Answer regenerated");
      } else {
        toast.error(result.error || "Failed to regenerate");
      }
    } catch (error) {
      toast.error("Failed to regenerate answer");
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      await removeQuestion({ questionId: question._id });
      toast.success("Question removed");
    } catch (error) {
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
      <CardContent className="p-4 space-y-3">
        {/* Header: Question number, text, type, status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">Q{question.questionNumber}:</span>
              <Badge variant="outline" className="text-xs">
                {typeLabels[question.questionType] || question.questionType}
              </Badge>
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
            <p className="text-sm mt-1">{question.questionText}</p>
          </div>
        </div>

        {/* Answer */}
        {!isPending && (
          <div className="bg-muted/50 rounded-md p-3">
            <div className="text-xs text-muted-foreground mb-1">Answer:</div>
            <div className="text-sm font-medium whitespace-pre-wrap">
              {formatAnswer(question.answer)}
            </div>
          </div>
        )}

        {/* Snippets (collapsible) */}
        {question.snippets && question.snippets.length > 0 && (
          <Collapsible open={snippetsOpen} onOpenChange={setSnippetsOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              {snippetsOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Snippets ({question.snippets.length})
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-1">
              {question.snippets.map((snippet, i) => (
                <div
                  key={i}
                  className="text-xs bg-muted rounded px-2 py-1 italic"
                >
                  "{snippet}"
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Source */}
        {question.source && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {!isPending && (
          <div className="flex items-center gap-2 pt-2 border-t">
            {!isApproved && (
              <Button
                size="sm"
                variant="default"
                onClick={handleApprove}
                disabled={isApproving}
                className="h-7 text-xs"
              >
                {isApproving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
                Approve
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEdit(question)}
              className="h-7 text-xs"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="h-7 text-xs"
            >
              {isRegenerating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Regenerate
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRemove}
              disabled={isRemoving}
              className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              {isRemoving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
