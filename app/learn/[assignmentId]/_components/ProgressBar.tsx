"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Id } from "@/convex/_generated/dataModel";
import { Check, ChevronRight, ChevronLeft } from "lucide-react";

interface Question {
  _id: Id<"questions">;
  questionNumber: string;
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 5);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll);
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [checkScroll, questions.length]);

  return (
    <div className="flex items-center gap-3">
      {/* Progress summary */}
      <div className="text-xs text-muted-foreground shrink-0 min-w-[60px]">
        {correctCount}/{questions.length} done
      </div>

      {/* Question indicators with scroll hints */}
      <div className="relative flex-1 min-w-0">
        {/* Left fade + chevron */}
        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 w-10 bg-gradient-to-r from-background via-background/80 to-transparent z-10 pointer-events-none flex items-center justify-start pl-1 transition-opacity duration-200",
            canScrollLeft ? "opacity-100" : "opacity-0",
          )}
        >
          <ChevronLeft className="h-4 w-4 text-muted-foreground/60" />
        </div>

        {/* Right fade + chevron */}
        <div
          className={cn(
            "absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-background via-background/80 to-transparent z-10 pointer-events-none flex items-center justify-end pr-1 transition-opacity duration-200",
            canScrollRight ? "opacity-100" : "opacity-0",
          )}
        >
          <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
        </div>

        <div
          ref={scrollRef}
          className="flex items-center gap-1.5 py-1 overflow-x-auto px-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
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
                  "w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] font-medium transition-all shrink-0",
                  "hover:opacity-80 focus:outline-none",
                  isCurrent && "ring-2 ring-offset-1 ring-foreground",
                  isCorrect && "bg-green-500 text-white",
                  isInProgress &&
                    !isCorrect &&
                    "bg-muted-foreground/20 text-foreground",
                  !isCorrect &&
                    !isInProgress &&
                    "bg-muted text-muted-foreground",
                )}
                title={`Question ${q.questionNumber}${isCorrect ? " - Correct" : isInProgress ? " - Started" : ""}`}
              >
                {isCorrect ? (
                  <Check className="h-3 w-3" strokeWidth={3} />
                ) : (
                  q.questionNumber
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
