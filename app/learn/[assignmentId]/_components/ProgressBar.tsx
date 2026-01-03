"use client";

import { cn } from "@/lib/utils";
import { Id } from "@/convex/_generated/dataModel";
import { Check } from "lucide-react";

interface Question {
  _id: Id<"questions">;
  questionNumber: number;
}

interface Progress {
  questionId: Id<"questions">;
  status: "not_started" | "in_progress" | "correct" | "incorrect";
}

interface ProgressBarProps {
  questions: Question[];
  progress: Progress[];
  currentIndex: number;
  onQuestionClick: (index: number) => void;
}

export function ProgressBar({
  questions,
  progress,
  currentIndex,
  onQuestionClick,
}: ProgressBarProps) {
  const progressMap = new Map(progress.map((p) => [p.questionId, p]));
  const correctCount = progress.filter((p) => p.status === "correct").length;

  return (
    <div className="flex items-center gap-2">
      {/* Progress summary */}
      <div className="text-xs text-muted-foreground shrink-0 min-w-[60px]">
        {correctCount}/{questions.length} done
      </div>

      {/* Question indicators */}
      <div className="flex items-center gap-1.5 py-1 overflow-x-auto scrollbar-hide flex-1">
        {questions.map((q, i) => {
          const p = progressMap.get(q._id);
          const isCorrect = p?.status === "correct";
          const isInProgress = p?.status === "in_progress";
          const isCurrent = i === currentIndex;

          return (
            <button
              key={q._id}
              onClick={() => onQuestionClick(i)}
              className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium transition-all shrink-0",
                "hover:opacity-80 focus:outline-none",
                isCurrent && "ring-2 ring-offset-1 ring-foreground",
                isCorrect && "bg-green-500 text-white",
                isInProgress && !isCorrect && "bg-muted-foreground/20 text-foreground",
                !isCorrect && !isInProgress && "bg-muted text-muted-foreground"
              )}
              title={`Question ${q.questionNumber}${isCorrect ? " - Correct" : isInProgress ? " - Started" : ""}`}
            >
              {isCorrect ? (
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              ) : (
                q.questionNumber
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
