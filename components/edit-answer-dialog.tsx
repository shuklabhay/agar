"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type Question = {
  _id: Id<"questions">;
  questionNumber: number;
  questionText: string;
  questionType: string;
  answer?: string | string[];
  keyPoints?: string[];
};

interface EditAnswerDialogProps {
  question: Question | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditAnswerDialog({
  question,
  open,
  onOpenChange,
}: EditAnswerDialogProps) {
  const [answer, setAnswer] = useState("");
  const [keyPoints, setKeyPoints] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const editQuestionAnswer = useMutation(api.questions.editQuestionAnswer);

  // Initialize form when question changes
  useEffect(() => {
    if (question) {
      // Convert answer to string for editing
      if (Array.isArray(question.answer)) {
        setAnswer(question.answer.join("\n"));
      } else {
        setAnswer(question.answer || "");
      }
      // Convert keyPoints to newline-separated string
      setKeyPoints(question.keyPoints?.join("\n") || "");
    }
  }, [question]);

  const handleSave = async () => {
    if (!question) return;

    setIsSaving(true);
    try {
      // Parse answer based on question type
      let parsedAnswer: string | string[];
      if (question.questionType === "free_response") {
        // Split by newlines for free response
        parsedAnswer = answer
          .split("\n")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      } else {
        parsedAnswer = answer.trim();
      }

      // Parse keyPoints
      const parsedKeyPoints = keyPoints
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      await editQuestionAnswer({
        questionId: question._id,
        answer: parsedAnswer,
        keyPoints: parsedKeyPoints.length > 0 ? parsedKeyPoints : undefined,
      });

      toast.success("Answer updated");
      onOpenChange(false);
    } catch {
      toast.error("Failed to update answer");
    } finally {
      setIsSaving(false);
    }
  };

  if (!question) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Answer - Q{question.questionNumber}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Question text (read-only) */}
          <div>
            <Label className="text-xs text-muted-foreground">Question</Label>
            <p className="text-sm mt-1 bg-muted/50 rounded px-2 py-1.5">
              {question.questionText}
            </p>
          </div>

          {/* Answer */}
          <div>
            <Label htmlFor="answer">
              Answer
              {question.questionType === "free_response" && (
                <span className="text-xs text-muted-foreground ml-1">
                  (one key point per line)
                </span>
              )}
            </Label>
            <Textarea
              id="answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={
                question.questionType === "free_response"
                  ? "Enter key points, one per line"
                  : "Enter the answer"
              }
              rows={question.questionType === "free_response" ? 4 : 2}
              className="mt-1"
            />
          </div>

          {/* Key Points */}
          <div>
            <Label htmlFor="keyPoints">
              Key Points
              <span className="text-xs text-muted-foreground ml-1">
                (one per line, optional)
              </span>
            </Label>
            <Textarea
              id="keyPoints"
              value={keyPoints}
              onChange={(e) => setKeyPoints(e.target.value)}
              placeholder="Supporting excerpts from notes that justify the answer"
              rows={3}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
