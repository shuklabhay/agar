"use client";

import { cn } from "@/lib/utils";
import { CheckCircle, XCircle } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { RioEyes } from "./RioEyes";
import { useEffect, useState, useRef } from "react";

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

interface ChatMessageProps {
  message: {
    _id: Id<"chatMessages">;
    role: "student" | "tutor" | "system";
    content: string;
    timestamp: number;
    toolCall?: ToolCall;
  };
  showRio?: boolean;
  isLastFromSender?: boolean;
  isSending?: boolean;
}

export function ChatMessage({ message, showRio = false, isLastFromSender = true, isSending = false }: ChatMessageProps) {
  const isStudent = message.role === "student";
  const isTutor = message.role === "tutor";

  // Rio should hide when sending (fade out early)
  const shouldShowRio = showRio && !isSending;
  const [isNew, setIsNew] = useState(true);
  const hasAnimated = useRef(false);

  // Track if this message has already been shown (not new anymore)
  useEffect(() => {
    if (!hasAnimated.current && showRio && isTutor) {
      hasAnimated.current = true;
      // Keep isNew true for animation, then set to false
      const timer = setTimeout(() => setIsNew(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [showRio, isTutor]);

  // Determine Rio's mood based on tool call
  const getRioMood = () => {
    if (!message.toolCall) return "idle";
    const { name, args } = message.toolCall;
    if (name === "mark_answer_correct") return "correct";
    if (name === "evaluate_response") {
      return (args.isCorrect as boolean) ? "correct" : "incorrect";
    }
    return "idle";
  };

  // Render tool call indicators
  const renderToolIndicator = () => {
    if (!message.toolCall) return null;

    const { name, args } = message.toolCall;

    if (name === "mark_answer_correct") {
      const questionNumber = args.questionNumber as number | undefined;
      return (
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm mt-2 bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2">
          <CheckCircle className="h-4 w-4" />
          <span className="font-medium">
            Question {questionNumber ?? "?"} marked correct!
          </span>
        </div>
      );
    }


    if (name === "evaluate_response") {
      const isCorrect = args.isCorrect as boolean;
      return (
        <div
          className={cn(
            "flex items-center gap-2 text-sm mt-2 rounded-lg px-3 py-2",
            isCorrect
              ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20"
              : "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20"
          )}
        >
          {isCorrect ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          <span className="font-medium">
            {isCorrect ? "Response evaluated: Correct!" : "Response needs revision"}
          </span>
        </div>
      );
    }

    return null;
  };

  return (
    <div
      className={cn(
        "flex flex-col",
        isStudent ? "items-end" : "items-start"
      )}
    >
      {/* Message row with Rio */}
      <div
        className={cn(
          "flex",
          isStudent ? "flex-row-reverse" : "flex-row items-end gap-2"
        )}
      >
        {/* Rio avatar - only for tutor messages */}
        {isTutor && (
          <div
            className={cn(
              "shrink-0 flex items-end self-end overflow-hidden",
              shouldShowRio ? "w-7 opacity-100" : "w-0 opacity-0"
            )}
            style={{
              transition: shouldShowRio
                ? "width 480ms ease-in-out 320ms, opacity 480ms ease-in-out 320ms"
                : "width 550ms ease-in-out, opacity 550ms ease-in-out"
            }}
          >
            <RioEyes mood={getRioMood()} />
          </div>
        )}

        {/* Message bubble */}
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 max-w-[80%]",
            isStudent
              ? cn("bg-primary text-primary-foreground", isLastFromSender && "rounded-br-sm")
              : cn("bg-muted", isLastFromSender && "rounded-bl-sm")
          )}
          style={{
            ...(showRio && isNew && isTutor ? {
              opacity: 0,
              animation: "fadeIn 320ms ease-out 100ms forwards"
            } : {})
          }}
        >
          <p className="text-sm whitespace-pre-wrap leading-relaxed">
            {message.content}
          </p>
        </div>
      </div>

      {/* Tool call indicator (only for tutor messages) */}
      {isTutor && (
        <div className={cn(
          "transition-all duration-500 ease-in-out",
          shouldShowRio ? "ml-9" : "ml-0"
        )}>
          {renderToolIndicator()}
        </div>
      )}

      {/* Timestamp */}
      <span className={cn(
        "text-xs text-muted-foreground mt-1 px-1 transition-all duration-500 ease-in-out",
        shouldShowRio ? "ml-9" : "ml-0"
      )}>
        {new Date(message.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    </div>
  );
}
