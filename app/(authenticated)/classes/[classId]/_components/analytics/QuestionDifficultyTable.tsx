"use client";

import { useState } from "react";
import Cookies from "js-cookie";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  QuestionStats,
  QuestionSortField,
  QuestionSortDirection,
} from "@/lib/types";

export type { QuestionSortField, QuestionSortDirection } from "@/lib/types";

interface QuestionDifficultyTableProps {
  questions: QuestionStats[];
  struggleQuestionIds?: string[];
  sortField?: QuestionSortField;
  sortDirection?: QuestionSortDirection;
  onSortChange?: (
    field: QuestionSortField,
    direction: QuestionSortDirection,
  ) => void;
}

function formatTime(ms: number): string {
  if (ms === 0) return "—";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const SORT_FIELD_COOKIE = "agar_question_sort_field";
const SORT_DIR_COOKIE = "agar_question_sort_dir";

// Extracted outside component to avoid recreating on each render
function SortHeader({
  field,
  children,
  className,
  sortField,
  sortDirection,
  onSort,
}: {
  field: QuestionSortField;
  children: React.ReactNode;
  className?: string;
  sortField: QuestionSortField;
  sortDirection: QuestionSortDirection;
  onSort: (field: QuestionSortField) => void;
}) {
  return (
    <th
      className={cn(
        "px-3 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none",
        className,
      )}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field &&
          (sortDirection === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          ))}
      </div>
    </th>
  );
}

export function QuestionDifficultyTable({
  questions,
  struggleQuestionIds = [],
  sortField: externalSortField,
  sortDirection: externalSortDirection,
  onSortChange,
}: QuestionDifficultyTableProps) {
  // Load from cookies via lazy initialization
  const [internalSortField, setInternalSortField] = useState<QuestionSortField>(
    () => {
      if (typeof window === "undefined") return "questionNumber";
      return (
        (Cookies.get(SORT_FIELD_COOKIE) as QuestionSortField) ||
        "questionNumber"
      );
    },
  );
  const [internalSortDirection, setInternalSortDirection] =
    useState<QuestionSortDirection>(() => {
      if (typeof window === "undefined") return "asc";
      return (Cookies.get(SORT_DIR_COOKIE) as QuestionSortDirection) || "asc";
    });

  // Use external state if provided, otherwise use internal
  const sortField = externalSortField ?? internalSortField;
  const sortDirection = externalSortDirection ?? internalSortDirection;

  const handleSort = (field: QuestionSortField) => {
    let newDirection: QuestionSortDirection;
    if (sortField === field) {
      newDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      // Default to desc for most fields, asc for question number
      newDirection = field === "questionNumber" ? "asc" : "desc";
    }

    // Save to cookies
    Cookies.set(SORT_FIELD_COOKIE, field, { expires: 365 });
    Cookies.set(SORT_DIR_COOKIE, newDirection, { expires: 365 });

    if (onSortChange) {
      onSortChange(field, newDirection);
    } else {
      setInternalSortField(field);
      setInternalSortDirection(newDirection);
    }
  };

  const sortedQuestions = [...questions].sort((a, b) => {
    let comparison = 0;
    switch (sortField) {
      case "questionNumber":
        comparison = a.questionNumber - b.questionNumber;
        break;
      case "successRate":
        comparison = a.successRate - b.successRate;
        break;
      case "avgMessages":
        comparison = a.avgMessages - b.avgMessages;
        break;
      case "avgTimeMs":
        comparison = a.avgTimeMs - b.avgTimeMs;
        break;
      case "struggleScore":
        comparison = a.struggleScore - b.struggleScore;
        break;
    }
    return sortDirection === "asc" ? comparison : -comparison;
  });

  if (questions.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Question Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-muted-foreground text-sm">
            No question data available yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden !pb-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          Question Analysis ({questions.length} questions)
        </CardTitle>
      </CardHeader>
      <CardContent className="!p-0">
        <div>
          <table className="w-full border-collapse">
            <thead className="border-b bg-muted/30">
              <tr>
                <SortHeader
                  field="questionNumber"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Q#
                </SortHeader>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Question
                </th>
                <SortHeader
                  field="successRate"
                  className="text-center"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Success Rate
                </SortHeader>
                <SortHeader
                  field="avgMessages"
                  className="text-center"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Avg Messages
                </SortHeader>
                <SortHeader
                  field="avgTimeMs"
                  className="text-center"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Avg Time
                </SortHeader>
                <SortHeader
                  field="struggleScore"
                  className="text-center"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Difficulty
                </SortHeader>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedQuestions.map((question) => {
                const isStruggle = struggleQuestionIds.includes(
                  question.questionId,
                );
                return (
                  <tr
                    key={question.questionId}
                    className={cn(
                      "hover:bg-muted/20 transition-colors",
                      isStruggle && "bg-red-50/50",
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-sm">
                        {question.questionNumber}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 max-w-[300px]">
                      <p
                        className="text-sm truncate"
                        title={question.questionText}
                      >
                        {question.questionText}
                      </p>
                      <span className="text-xs text-muted-foreground capitalize">
                        {question.questionType.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          question.successRate >= 0.8 &&
                            "border-green-300 bg-green-50 text-green-700",
                          question.successRate >= 0.5 &&
                            question.successRate < 0.8 &&
                            "border-yellow-300 bg-yellow-50 text-yellow-700",
                          question.successRate < 0.5 &&
                            "border-red-300 bg-red-50 text-red-700",
                        )}
                      >
                        {Math.round(question.successRate * 100)}%
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="text-sm">
                        {question.avgMessages > 0
                          ? question.avgMessages.toFixed(1)
                          : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="text-sm text-muted-foreground">
                        {formatTime(question.avgTimeMs)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <DifficultyIndicator score={question.struggleScore} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function DifficultyIndicator({ score }: { score: number }) {
  // Score typically ranges from 0 (easy) to ~5+ (very hard)
  const level =
    score < 0.5
      ? "easy"
      : score < 1.5
        ? "medium"
        : score < 3
          ? "hard"
          : "very hard";
  const width = Math.min(100, (score / 4) * 100);

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            level === "easy" && "bg-green-500",
            level === "medium" && "bg-yellow-500",
            level === "hard" && "bg-orange-500",
            level === "very hard" && "bg-red-500",
          )}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground capitalize">{level}</span>
    </div>
  );
}
