"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface AssignmentPerformance {
  assignmentId: string;
  assignmentName: string;
  questionsCompleted: number;
  totalQuestions: number;
  completionRate: number;
  avgMessages: number;
  totalTimeMs: number;
  lastActiveAt: number;
}

interface StudentData {
  name: string;
  assignments: AssignmentPerformance[];
  totalQuestionsCompleted: number;
  totalQuestions: number;
  overallCompletionRate: number;
  lastActiveAt: number;
}

interface AllStudentsTableProps {
  students: StudentData[];
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

export function AllStudentsTable({ students }: AllStudentsTableProps) {
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());

  const toggleExpanded = (name: string) => {
    const newSet = new Set(expandedStudents);
    if (newSet.has(name)) {
      newSet.delete(name);
    } else {
      newSet.add(name);
    }
    setExpandedStudents(newSet);
  };

  if (students.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            All Students
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-muted-foreground text-sm">
            No students have started any assignments yet
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
          All Students ({students.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {students.map((student) => {
            const isExpanded = expandedStudents.has(student.name);
            return (
              <div key={student.name}>
                {/* Student row */}
                <button
                  onClick={() => toggleExpanded(student.name)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="shrink-0">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm">{student.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {student.assignments.length} assignment{student.assignments.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-center">
                      <div className="text-sm font-medium">
                        {student.totalQuestionsCompleted}/{student.totalQuestions}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {Math.round(student.overallCompletionRate * 100)}%
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        student.overallCompletionRate >= 0.8
                          ? "border-green-300 bg-green-50 text-green-700"
                          : student.overallCompletionRate >= 0.5
                            ? "border-yellow-300 bg-yellow-50 text-yellow-700"
                            : "border-red-300 bg-red-50 text-red-700"
                      )}
                    >
                      {student.overallCompletionRate >= 0.8
                        ? "On Track"
                        : student.overallCompletionRate >= 0.5
                          ? "Needs Help"
                          : "At Risk"}
                    </Badge>
                    <span className="text-xs text-muted-foreground w-20 text-right">
                      {formatRelativeTime(student.lastActiveAt)}
                    </span>
                  </div>
                </button>

                {/* Expanded assignment details */}
                {isExpanded && (
                  <div className="bg-muted/20 px-4 py-2 border-t">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground">
                          <th className="text-left py-1.5 font-medium">Assignment</th>
                          <th className="text-center py-1.5 font-medium">Completed</th>
                          <th className="text-center py-1.5 font-medium">Avg Messages</th>
                          <th className="text-center py-1.5 font-medium">Time Spent</th>
                          <th className="text-right py-1.5 font-medium">Last Active</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {student.assignments.map((assignment) => (
                          <tr key={assignment.assignmentId} className="hover:bg-muted/20">
                            <td className="py-2 text-sm">{assignment.assignmentName}</td>
                            <td className="py-2 text-center">
                              <span className="text-sm">
                                {assignment.questionsCompleted}/{assignment.totalQuestions}
                              </span>
                              <span className="text-xs text-muted-foreground ml-1">
                                ({Math.round(assignment.completionRate * 100)}%)
                              </span>
                            </td>
                            <td className="py-2 text-center text-sm">
                              {assignment.avgMessages > 0 ? assignment.avgMessages.toFixed(1) : "—"}
                            </td>
                            <td className="py-2 text-center text-sm text-muted-foreground">
                              {formatTime(assignment.totalTimeMs)}
                            </td>
                            <td className="py-2 text-right text-xs text-muted-foreground">
                              {formatRelativeTime(assignment.lastActiveAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
