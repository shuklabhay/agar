"use client";

import { cn } from "@/lib/utils";
import { Bot, User, Lightbulb, CheckCircle, XCircle } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";

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
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isStudent = message.role === "student";
  const isTutor = message.role === "tutor";

  // Render tool call indicators
  const renderToolIndicator = () => {
    if (!message.toolCall) return null;

    const { name, args } = message.toolCall;

    if (name === "mark_answer_correct") {
      return (
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm mt-2 bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2">
          <CheckCircle className="h-4 w-4" />
          <span className="font-medium">Answer marked correct!</span>
        </div>
      );
    }

    if (name === "provide_hint") {
      const level = args.level as number;
      return (
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm mt-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
          <Lightbulb className="h-4 w-4" />
          <span className="font-medium">Hint (Level {level})</span>
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
        "flex gap-3",
        isStudent && "flex-row-reverse"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
          isStudent
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        {isStudent ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>

      {/* Message content */}
      <div
        className={cn(
          "flex flex-col max-w-[80%]",
          isStudent && "items-end"
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5",
            isStudent
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-muted rounded-bl-sm"
          )}
        >
          <p className="text-sm whitespace-pre-wrap leading-relaxed">
            {message.content}
          </p>
        </div>

        {/* Tool call indicator (only for tutor messages) */}
        {isTutor && renderToolIndicator()}

        {/* Timestamp */}
        <span className="text-xs text-muted-foreground mt-1 px-1">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}
