"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type RioMood = "idle" | "happy" | "thinking" | "correct" | "incorrect";

interface RioEyesProps {
  mood?: RioMood;
  size?: "sm" | "md";
  shaking?: boolean;
}

export function RioEyes({ mood = "idle", size = "md", shaking = false }: RioEyesProps) {
  const [lookDirection, setLookDirection] = useState({ x: 0, y: 0 });
  const [isBlinking, setIsBlinking] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  // Trigger shake animation
  useEffect(() => {
    if (shaking) {
      setIsShaking(true);
      const timer = setTimeout(() => setIsShaking(false), 500);
      return () => clearTimeout(timer);
    }
  }, [shaking]);

  // Idle animation - random looking around
  useEffect(() => {
    if (mood !== "idle") return;

    const lookInterval = setInterval(() => {
      // Random look direction
      setLookDirection({
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

  // Reset look direction for non-idle moods
  useEffect(() => {
    if (mood === "correct") {
      // Happy curved eyes (look up)
      setLookDirection({ x: 0, y: -0.5 });
    } else if (mood === "incorrect") {
      // Sympathetic (look down slightly)
      setLookDirection({ x: 0, y: 0.5 });
    } else if (mood === "thinking") {
      // Look up and to the side
      setLookDirection({ x: 1, y: -0.5 });
    }
  }, [mood]);

  const containerSize = size === "sm" ? "w-6 h-6" : "w-7 h-7";

  return (
    <div
      className={cn(
        "rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0",
        containerSize,
        isShaking && "animate-head-shake"
      )}
      style={isShaking ? {
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
