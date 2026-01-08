"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { RioMood } from "@/lib/types";

interface RioEyesProps {
  mood?: RioMood;
  size?: "sm" | "md" | "lg" | "xl";
  shaking?: boolean;
}

export function RioEyes({
  mood = "idle",
  size = "md",
  shaking = false,
}: RioEyesProps) {
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

    const blinkInterval = setInterval(
      () => {
        setIsBlinking(true);
        setTimeout(() => setIsBlinking(false), 150);
      },
      5000 + Math.random() * 4000,
    );

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

  const sizes = {
    sm: {
      container: "w-6 h-6",
      eyeW: 3,
      eyeH: 8,
      eyeBlink: 2,
      eyeCorrect: 7,
      gap: 2,
    },
    md: {
      container: "w-7 h-7",
      eyeW: 3,
      eyeH: 10,
      eyeBlink: 2,
      eyeCorrect: 8,
      gap: 3,
    },
    lg: {
      container: "w-10 h-10",
      eyeW: 4,
      eyeH: 14,
      eyeBlink: 3,
      eyeCorrect: 11,
      gap: 3.5,
    },
    xl: {
      container: "w-16 h-16",
      eyeW: 6,
      eyeH: 20,
      eyeBlink: 4,
      eyeCorrect: 16,
      gap: 4,
    },
  } as const;

  const sizeSpec = sizes[size] ?? sizes.md;
  const eyeHeight =
    mood === "correct"
      ? sizeSpec.eyeCorrect
      : isBlinking
        ? sizeSpec.eyeBlink
        : sizeSpec.eyeH;

  return (
    <div
      className={cn(
        "rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0",
        sizeSpec.container,
        shaking && "animate-head-shake",
      )}
      style={
        shaking
          ? {
              animation: "headShake 0.5s ease-in-out",
            }
          : undefined
      }
    >
      <div
        className="flex items-center"
        style={{
          gap: sizeSpec.gap,
        }}
      >
        {/* Left eye */}
        <div
          className={cn(
            "rounded-full transition-all duration-300 bg-violet-600 dark:bg-violet-400",
            mood === "incorrect" && "opacity-50",
          )}
          style={{
            width: sizeSpec.eyeW,
            height: eyeHeight,
            borderRadius: sizeSpec.eyeW,
            ...(mood === "correct"
              ? { borderTopLeftRadius: 0, borderTopRightRadius: 0 }
              : {}),
            transform: `translate(${lookDirection.x}px, ${lookDirection.y}px)`,
          }}
        />
        {/* Right eye */}
        <div
          className={cn(
            "rounded-full transition-all duration-300 bg-violet-600 dark:bg-violet-400",
            mood === "incorrect" && "opacity-50",
          )}
          style={{
            width: sizeSpec.eyeW,
            height: eyeHeight,
            borderRadius: sizeSpec.eyeW,
            ...(mood === "correct"
              ? { borderTopLeftRadius: 0, borderTopRightRadius: 0 }
              : {}),
            transform: `translate(${lookDirection.x}px, ${lookDirection.y}px)`,
          }}
        />
      </div>
    </div>
  );
}
