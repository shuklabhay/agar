"use client";

import { RioEyes } from "./RioEyes";
import { Button } from "@/components/ui/button";
import { PartyPopper, Sparkles } from "lucide-react";

interface CompletionCelebrationProps {
  totalQuestions: number;
  onClose: () => void;
}

const confettiPieces = [
  { left: "6%", delay: "0s", duration: "6.8s", width: 10, height: 18 },
  { left: "18%", delay: "0.35s", duration: "7s", width: 12, height: 16 },
  { left: "30%", delay: "0.6s", duration: "6.5s", width: 9, height: 20 },
  { left: "44%", delay: "0.15s", duration: "7.2s", width: 11, height: 18 },
  { left: "58%", delay: "0.5s", duration: "6.6s", width: 10, height: 16 },
  { left: "72%", delay: "0.2s", duration: "7s", width: 12, height: 20 },
  { left: "85%", delay: "0.75s", duration: "6.7s", width: 9, height: 18 },
  { left: "94%", delay: "0.4s", duration: "7.3s", width: 11, height: 19 },
];

const confettiColors = [
  "var(--primary)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "#f59e0b",
];

export function CompletionCelebration({
  totalQuestions,
  onClose,
}: CompletionCelebrationProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-background to-amber-50/60 dark:from-primary/25 dark:via-background dark:to-amber-900/15 backdrop-blur-[2px]" />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {confettiPieces.map((piece, idx) => (
          <span
            key={idx}
            className="absolute rounded-full celebration-confetti"
            style={{
              left: piece.left,
              top: "-10%",
              width: piece.width,
              height: piece.height,
              backgroundColor: confettiColors[idx % confettiColors.length],
              animationDuration: piece.duration,
              animationDelay: piece.delay,
            }}
          />
        ))}
        <div className="absolute top-10 right-14 w-24 h-24 rounded-full bg-primary/12 blur-3xl celebration-pulse" />
        <div className="absolute bottom-12 left-12 w-28 h-28 rounded-full bg-amber-200/60 dark:bg-amber-500/15 blur-3xl celebration-float" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.16),transparent_35%),radial-gradient(circle_at_80%_30%,rgba(52,211,153,0.14),transparent_30%),radial-gradient(circle_at_60%_70%,rgba(59,130,246,0.12),transparent_28%)] celebration-sparkle" />
      </div>

      <div className="relative max-w-2xl w-full bg-background/95 border border-primary/15 shadow-2xl rounded-3xl px-8 py-10 space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-4 py-2 text-xs font-semibold tracking-wide uppercase">
          <PartyPopper className="h-4 w-4" />
          <span>All questions complete</span>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10">
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl celebration-pulse" />
            <div className="relative celebration-float">
              <RioEyes mood="correct" size="xl" />
            </div>
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/80 dark:bg-foreground/10 text-[11px] font-semibold px-3 py-1 border border-primary/10 backdrop-blur">
              Rio is cheering
            </div>
          </div>

          <div className="flex-1 space-y-3 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2 text-sm font-semibold text-primary">
              <Sparkles className="h-4 w-4" />
              <span>Great work</span>
            </div>
            <h2 className="text-2xl font-bold">You did it!</h2>
            <p className="text-muted-foreground leading-relaxed">
              All {totalQuestions} questions are wrapped up. Take a breath or
              keep chatting with Rio to review anything you want to revisit.
            </p>
            <div className="grid grid-cols-2 gap-3 max-w-md mx-auto md:mx-0">
              <div className="rounded-xl border bg-muted/40 p-3 text-left shadow-sm">
                <p className="text-xs text-muted-foreground">Progress</p>
                <p className="text-lg font-semibold">100%</p>
              </div>
              <div className="rounded-xl border bg-muted/40 p-3 text-left shadow-sm">
                <p className="text-xs text-muted-foreground">Questions done</p>
                <p className="text-lg font-semibold">{totalQuestions}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Button size="lg" className="shadow-lg" onClick={onClose}>
            Back to questions
          </Button>
        </div>
      </div>
    </div>
  );
}
