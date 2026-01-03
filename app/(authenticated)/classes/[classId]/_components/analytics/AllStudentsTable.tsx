"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronRight, Users, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AssignmentPerformance {
  assignmentId: string;
  assignmentName: string;
  sessionId: string;
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
  overallAvgMessages: number;
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
  const [selectedAssignment, setSelectedAssignment] = useState<{
    sessionId: string;
    assignmentName: string;
    studentName: string;
  } | null>(null);

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
    <>
      <Card className="overflow-hidden !pb-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            All Students ({students.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="!p-0">
          {/* Table header */}
          <div className="px-4 py-2 border-b bg-muted/30 grid grid-cols-[auto_1fr_100px_100px_100px_100px] gap-2 items-center text-xs font-medium text-muted-foreground">
            <div className="w-5" /> {/* Chevron space */}
            <div>Student</div>
            <div className="text-center">Completion</div>
            <div className="text-center">Avg Msgs</div>
            <div className="text-center">Avg Time</div>
            <div className="text-right">Last Active</div>
          </div>
          <div className="divide-y">
            {students.map((student) => {
              const isExpanded = expandedStudents.has(student.name);
              const pct = Math.round(student.overallCompletionRate * 100);
              // Calculate average time across all assignments
              const totalTimeMs = student.assignments.reduce((sum, a) => sum + a.totalTimeMs, 0);
              const avgTimeMs = student.assignments.length > 0 ? totalTimeMs / student.assignments.length : 0;
              return (
                <div key={student.name}>
                  {/* Student row */}
                  <button
                    onClick={() => toggleExpanded(student.name)}
                    className="w-full px-4 py-3 grid grid-cols-[auto_1fr_100px_100px_100px_100px] gap-2 items-center hover:bg-muted/30 transition-colors text-left"
                  >
                    <div className="w-5">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium text-sm">{student.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {student.assignments.length} assignment{student.assignments.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="flex flex-col items-center">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-sm font-medium",
                          pct >= 80 && "border-green-300 bg-green-50 text-green-700",
                          pct >= 50 && pct < 80 && "border-yellow-300 bg-yellow-50 text-yellow-700",
                          pct < 50 && "border-red-300 bg-red-50 text-red-700"
                        )}
                      >
                        {pct}%
                      </Badge>
                      <span className="text-xs text-muted-foreground mt-0.5">
                        {student.totalQuestionsCompleted}/{student.totalQuestions}
                      </span>
                    </div>
                    <span className="text-sm text-center">
                      {student.overallAvgMessages > 0 ? student.overallAvgMessages.toFixed(1) : "—"}
                    </span>
                    <span className="text-sm text-muted-foreground text-center">
                      {formatTime(avgTimeMs)}
                    </span>
                    <span className="text-xs text-muted-foreground text-right">
                      {formatRelativeTime(student.lastActiveAt)}
                    </span>
                  </button>

                  {/* Expanded assignment details */}
                  {isExpanded && (
                    <div className="bg-muted/20 border-t">
                      <div className="divide-y divide-border/50">
                        {student.assignments.map((assignment) => (
                          <div
                            key={assignment.assignmentId}
                            className="px-4 py-2 grid grid-cols-[auto_1fr_100px_100px_100px_100px] gap-2 items-center hover:bg-muted/40 cursor-pointer"
                            onClick={() => setSelectedAssignment({
                              sessionId: assignment.sessionId,
                              assignmentName: assignment.assignmentName,
                              studentName: student.name,
                            })}
                          >
                            <div className="w-5" /> {/* Spacer for alignment */}
                            <div className="text-sm">{assignment.assignmentName}</div>
                            <div className="text-center">
                              <span className="text-sm">
                                {assignment.questionsCompleted}/{assignment.totalQuestions}
                              </span>
                              <span className="text-xs text-muted-foreground ml-1">
                                ({Math.round(assignment.completionRate * 100)}%)
                              </span>
                            </div>
                            <div className="text-sm text-center">
                              {assignment.avgMessages > 0 ? assignment.avgMessages.toFixed(1) : "—"}
                            </div>
                            <div className="text-sm text-muted-foreground text-center">
                              {formatTime(assignment.totalTimeMs)}
                            </div>
                            <div className="text-xs text-muted-foreground text-right">
                              {formatRelativeTime(assignment.lastActiveAt)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Per-question details dialog */}
      <Dialog open={!!selectedAssignment} onOpenChange={(open) => !open && setSelectedAssignment(null)}>
        <DialogContent
          className="!max-w-none flex flex-col gap-2"
          style={{ width: "80vw", height: "85vh" }}
        >
          <DialogHeader className="pb-0">
            <DialogTitle>
              {selectedAssignment?.studentName} - {selectedAssignment?.assignmentName}
            </DialogTitle>
          </DialogHeader>
          {selectedAssignment && (
            <StudentQuestionDetails sessionId={selectedAssignment.sessionId as Id<"studentSessions">} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Sub-component for fetching and displaying per-question details
function StudentQuestionDetails({ sessionId }: { sessionId: Id<"studentSessions"> }) {
  const details = useQuery(api.analytics.getStudentQuestionDetails, { sessionId });

  if (!details) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (details.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No question data available
      </div>
    );
  }

  return (
    <div className="overflow-y-auto flex-1 pr-4">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background border-b">
          <tr className="text-xs text-muted-foreground">
            <th className="text-left py-2 font-medium">Q#</th>
            <th className="text-left py-2 font-medium">Question</th>
            <th className="text-center py-2 font-medium">Status</th>
            <th className="text-center py-2 font-medium">Messages</th>
            <th className="text-center py-2 font-medium">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {details.map((q) => (
            <tr key={q.questionId} className="hover:bg-muted/20">
              <td className="py-2 font-medium">{q.questionNumber}</td>
              <td className="py-2 max-w-[300px]">
                <p className="truncate text-sm" title={q.questionText}>
                  {q.questionText}
                </p>
              </td>
              <td className="py-2 text-center">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    q.status === "correct" && "border-green-300 bg-green-50 text-green-700",
                    q.status === "incorrect" && "border-red-300 bg-red-50 text-red-700",
                    q.status === "in_progress" && "border-yellow-300 bg-yellow-50 text-yellow-700",
                    q.status === "not_started" && "border-gray-300 bg-gray-50 text-gray-700"
                  )}
                >
                  {q.status === "correct" ? "Correct" :
                   q.status === "incorrect" ? "Incorrect" :
                   q.status === "in_progress" ? "In Progress" : "Not Started"}
                </Badge>
              </td>
              <td className="py-2 text-center text-sm">
                {q.messageCount > 0 ? q.messageCount : "—"}
              </td>
              <td className="py-2 text-center text-sm text-muted-foreground">
                {formatTime(q.timeSpentMs)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
