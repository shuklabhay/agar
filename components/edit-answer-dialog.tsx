"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
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
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EditableQuestion, KeyPoint } from "@/lib/types";
import { normalizeKeyPoints } from "@/lib/keyPoints";

interface EditAnswerDialogProps {
  question: EditableQuestion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditAnswerDialog({
  question,
  open,
  onOpenChange,
}: EditAnswerDialogProps) {
  const [answer, setAnswer] = useState("");
  const [keyPoints, setKeyPoints] = useState<KeyPoint[]>([
    { point: "", url: "", sourceType: "notes" },
  ]);
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
      const normalized = normalizeKeyPoints(question.keyPoints);
      setKeyPoints(
        normalized.length > 0
          ? normalized
          : [
              {
                point: "",
                url: "",
                sourceType: "notes",
              },
            ],
      );
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

      // Parse keyPoints from rows
      const parsedKeyPoints = keyPoints
        .map((kp) => ({
          point: kp.point.trim(),
          url: kp.url?.trim() || undefined,
          sourceType: kp.sourceType.trim() || "unknown",
        }))
        .filter((kp) => kp.point.length > 0);

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
          <div className="space-y-2">
            <Label>Key Points</Label>
            <div className="hidden sm:grid sm:grid-cols-[6fr_4fr_2fr_auto] gap-2 text-xs text-muted-foreground">
              <span>Point</span>
              <span>URL (website only)</span>
              <span>Source Type</span>
              <span />
            </div>
            <div className="space-y-2">
              {keyPoints.map((kp, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-[6fr_4fr_2fr_auto] items-start"
                >
                  <Textarea
                    value={kp.point}
                    onChange={(e) => {
                      const next = [...keyPoints];
                      next[idx] = { ...kp, point: e.target.value };
                      setKeyPoints(next);
                    }}
                    placeholder="Supporting excerpt"
                    rows={2}
                  />
                  {kp.sourceType === "website" ? (
                    <Input
                      value={kp.url || ""}
                      onChange={(e) => {
                        const next = [...keyPoints];
                        next[idx] = { ...kp, url: e.target.value };
                        setKeyPoints(next);
                      }}
                      placeholder="https://source.com (website only)"
                    />
                  ) : (
                    <div className="text-[11px] text-muted-foreground sm:text-center">
                      URL not needed
                    </div>
                  )}
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-2 text-sm capitalize"
                    value={kp.sourceType}
                    onChange={(e) => {
                      const next = [...keyPoints];
                      next[idx] = { ...kp, sourceType: e.target.value };
                      if (e.target.value !== "website") {
                        next[idx].url = "";
                      }
                      setKeyPoints(next);
                    }}
                  >
                    {[
                      "notes",
                      "passage",
                      "figure",
                      "table",
                      "chart",
                      "website",
                      "unknown",
                    ].map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  {keyPoints.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 col-span-1"
                      onClick={() =>
                        setKeyPoints(keyPoints.filter((_, i) => i !== idx))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>URL required only for website sources.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() =>
                  setKeyPoints([
                    ...keyPoints,
                    { point: "", url: "", sourceType: "notes" },
                  ])
                }
              >
                <Plus className="h-4 w-4" />
                Add Key Point
              </Button>
            </div>
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
