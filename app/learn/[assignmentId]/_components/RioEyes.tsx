"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type RioMood = "idle" | "happy" | "thinking" | "correct" | "incorrect";

interface RioEyesProps {
  mood?: RioMood;
  size?: "sm" | "md";
  shaking?: boolean;
}

export function RioEyes({ mood = "idle", size = "md", shaking = false }: RioEyesProps) {
  const [idleLookDirection, setIdleLookDirection] = useState({ x: 0, y: 0 });
  const [isBlinking, setIsBlinking] = useState(false);

  // Use shaking prop directly for CSS animation (no state needed)

  // Idle animation - random looking around
  useEffect(() => {
    if (mood !== "idle") return;

    const lookInterval = setInterval(() => {
      // Random look direction
      setIdleLookDirection({
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 1.5,
      });
    }, 2000);

    const blinkInterval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 150);
    }, 5000 + Math.random() * 4000);

    return () => {
      clearInterval(lookInterval);
      clearInterval(blinkInterval);
    };
  }, [mood]);

  // Derive look direction from mood (non-idle moods have fixed directions)
  const lookDirection = useMemo(() => {
    if (mood === "correct") return { x: 0, y: -0.5 };
    if (mood === "incorrect") return { x: 0, y: 0.5 };
    if (mood === "thinking") return { x: 1, y: -0.5 };
    return idleLookDirection;
  }, [mood, idleLookDirection]);

  const containerSize = size === "sm" ? "w-6 h-6" : "w-7 h-7";

  return (
    <div
      className={cn(
        "rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0",
        containerSize,
        shaking && "animate-head-shake"
      )}
      style={shaking ? {
        animation: "headShake 0.5s ease-in-out"
      } : undefined}
    >
      <div className="flex items-center gap-[3px]">
        {/* Left eye */}
        <div
          className={cn(
            "w-[3px] rounded-full transition-all duration-300 bg-violet-600 dark:bg-violet-400",
            isBlinking ? "h-[2px]" : "h-[10px]",
            mood === "correct" && "rounded-t-none h-[8px]",
            mood === "incorrect" && "opacity-50"
          )}
          style={{
            transform: `translate(${lookDirection.x}px, ${lookDirection.y}px)`,
          }}
        />
        {/* Right eye */}
        <div
          className={cn(
            "w-[3px] rounded-full transition-all duration-300 bg-violet-600 dark:bg-violet-400",
            isBlinking ? "h-[2px]" : "h-[10px]",
            mood === "correct" && "rounded-t-none h-[8px]",
            mood === "incorrect" && "opacity-50"
          )}
          style={{
            transform: `translate(${lookDirection.x}px, ${lookDirection.y}px)`,
          }}
        />
      </div>
    </div>
  );
}
