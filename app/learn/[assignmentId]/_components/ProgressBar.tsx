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

  return (
    <div className="flex items-center gap-1 py-1 overflow-x-auto scrollbar-hide">
      {questions.map((q, i) => {
        const p = progressMap.get(q._id);
        const isCorrect = p?.status === "correct";
        const isIncorrect = p?.status === "incorrect";
        const isInProgress = p?.status === "in_progress";
        const isCurrent = i === currentIndex;

        return (
          <button
            key={q._id}
            onClick={() => onQuestionClick(i)}
            className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium transition-all shrink-0",
              "hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1",
              isCurrent && "ring-2 ring-primary ring-offset-1",
              isCorrect && "bg-green-500 text-white",
              isIncorrect && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
              isInProgress && !isCorrect && !isIncorrect && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
              !isCorrect && !isIncorrect && !isInProgress && "bg-muted text-muted-foreground"
            )}
            title={`Question ${q.questionNumber}${isCorrect ? " (Correct)" : isIncorrect ? " (Try again)" : ""}`}
          >
            {isCorrect ? (
              <Check className="h-3 w-3" />
            ) : (
              q.questionNumber
            )}
          </button>
        );
      })}
    </div>
  );
}
