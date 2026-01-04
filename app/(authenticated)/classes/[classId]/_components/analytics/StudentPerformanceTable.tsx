"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  StudentRecord,
  StudentTableSortField,
  SortDirection,
} from "@/lib/types";

interface StudentPerformanceTableProps {
  students: StudentRecord[];
}

function formatTime(ms: number): string {
  if (ms === 0) return "—";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

// Extracted outside component to avoid recreating on each render
function StudentSortHeader({
  field,
  children,
  className,
  sortField,
  sortDirection,
  onSort,
}: {
  field: StudentTableSortField;
  children: React.ReactNode;
  className?: string;
  sortField: StudentTableSortField;
  sortDirection: SortDirection;
  onSort: (field: StudentTableSortField) => void;
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

export function StudentPerformanceTable({
  students,
}: StudentPerformanceTableProps) {
  const [sortField, setSortField] =
    useState<StudentTableSortField>("lastActiveAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleSort = (field: StudentTableSortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "name" ? "asc" : "desc");
    }
  };

  const sortedStudents = [...students].sort((a, b) => {
    let comparison = 0;
    switch (sortField) {
      case "name":
        comparison = a.name.localeCompare(b.name);
        break;
      case "completionRate":
        comparison = a.completionRate - b.completionRate;
        break;
      case "avgMessages":
        comparison = a.avgMessages - b.avgMessages;
        break;
      case "totalTimeMs":
        comparison = a.totalTimeMs - b.totalTimeMs;
        break;
      case "lastActiveAt":
        comparison = a.lastActiveAt - b.lastActiveAt;
        break;
    }
    return sortDirection === "asc" ? comparison : -comparison;
  });

  if (students.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Student Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-muted-foreground text-sm">
            No students have started this assignment yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4" />
          Student Performance ({students.length} students)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-muted/30">
              <tr>
                <StudentSortHeader
                  field="name"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Name
                </StudentSortHeader>
                <StudentSortHeader
                  field="completionRate"
                  className="text-center"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Completed
                </StudentSortHeader>
                <StudentSortHeader
                  field="avgMessages"
                  className="text-center"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Avg Messages
                </StudentSortHeader>
                <StudentSortHeader
                  field="totalTimeMs"
                  className="text-center"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Time Spent
                </StudentSortHeader>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                  Understanding
                </th>
                <StudentSortHeader
                  field="lastActiveAt"
                  className="text-right"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Last Active
                </StudentSortHeader>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedStudents.map((student) => (
                <tr
                  key={student.sessionId}
                  className="hover:bg-muted/20 transition-colors"
                >
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-sm">{student.name}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex flex-col items-center">
                      <span className="text-sm font-medium">
                        {student.questionsCompleted}/{student.totalQuestions}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {Math.round(student.completionRate * 100)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="text-sm">
                      {student.avgMessages > 0
                        ? student.avgMessages.toFixed(1)
                        : "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="text-sm">
                      {formatTime(student.totalTimeMs)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <Badge
                      variant={
                        student.understandingLevel === "high"
                          ? "default"
                          : student.understandingLevel === "medium"
                            ? "secondary"
                            : "destructive"
                      }
                      className={cn(
                        "text-xs",
                        student.understandingLevel === "high" &&
                          "bg-green-100 text-green-800 hover:bg-green-100",
                        student.understandingLevel === "medium" &&
                          "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
                        student.understandingLevel === "low" &&
                          "bg-red-100 text-red-800 hover:bg-red-100",
                      )}
                    >
                      {student.understandingLevel.charAt(0).toUpperCase() +
                        student.understandingLevel.slice(1)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(student.lastActiveAt)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
