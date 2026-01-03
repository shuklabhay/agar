"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import Cookies from "js-cookie";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import {
  Users,
  CheckCircle,
  Clock,
  BarChart3,
  Loader2,
  MessageSquare,
  ChevronDown,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MetricCard } from "./MetricCard";
import { HorizontalBoxPlot } from "./BoxPlotChart";
import { StudentPerformanceTable } from "./StudentPerformanceTable";
import {
  QuestionDifficultyTable,
  QuestionSortField,
  QuestionSortDirection,
} from "./QuestionDifficultyTable";
import { AllStudentsTable } from "./AllStudentsTable";

interface Assignment {
  _id: Id<"assignments">;
  name: string;
  isDraft?: boolean;
}

interface ClassAnalyticsDashboardProps {
  classId: Id<"classes">;
  assignments: Assignment[];
}

type Tab = "overview" | "students";
type BoxPlotView = "per-question" | "per-assignment" | "all";

function formatTime(ms: number): string {
  if (ms === 0) return "—";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function ClassAnalyticsDashboard({
  classId,
  assignments,
}: ClassAnalyticsDashboardProps) {
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<
    Set<string>
  >(new Set());
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [boxPlotView, setBoxPlotView] = useState<BoxPlotView>("per-assignment");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  // Load sort preferences from cookies via lazy initialization
  const [questionSortField, setQuestionSortField] =
    useState<QuestionSortField>(() => {
      if (typeof window === "undefined") return "questionNumber";
      return (Cookies.get("agar_question_sort_field") as QuestionSortField) || "questionNumber";
    });
  const [questionSortDirection, setQuestionSortDirection] =
    useState<QuestionSortDirection>(() => {
      if (typeof window === "undefined") return "asc";
      return (Cookies.get("agar_question_sort_dir") as QuestionSortDirection) || "asc";
    });
  // Get user preferences for metric display
  const userPreferences = useQuery(api.myFunctions.getUserPreferences);
  const defaultMetric = userPreferences?.defaultMetric ?? "mean";

  const publishedAssignments = assignments.filter((a) => !a.isDraft);

  // Determine view mode
  const isAllSelected = selectedAssignmentIds.size === 0;
  const isSingleSelected = selectedAssignmentIds.size === 1;
  const isMultiSelected = selectedAssignmentIds.size > 1;
  const singleSelectedId = isSingleSelected
    ? Array.from(selectedAssignmentIds)[0]
    : null;

  // Queries
  const classAnalytics = useQuery(api.analytics.getClassAnalytics, { classId });
  const assignmentAnalytics = useQuery(
    api.analytics.getAssignmentAnalytics,
    singleSelectedId
      ? { assignmentId: singleSelectedId as Id<"assignments"> }
      : "skip",
  );
  const studentPerformance = useQuery(
    api.analytics.getStudentPerformance,
    singleSelectedId
      ? { assignmentId: singleSelectedId as Id<"assignments"> }
      : "skip",
  );
  const assignmentComparison = useQuery(
    api.analytics.getAssignmentComparisonBoxPlots,
    { classId },
  );
  const questionBoxPlots = useQuery(
    api.analytics.getQuestionBoxPlots,
    singleSelectedId
      ? { assignmentId: singleSelectedId as Id<"assignments"> }
      : "skip",
  );
  const allStudents = useQuery(api.analytics.getAllStudentsInClass, {
    classId,
  });

  // Toggle assignment selection
  const toggleAssignment = (id: string) => {
    const newSet = new Set(selectedAssignmentIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedAssignmentIds(newSet);

    // Reset box plot view when selection changes
    if (newSet.size === 1) {
      setBoxPlotView("per-question");
    } else {
      setBoxPlotView("per-assignment");
    }
  };

  const selectAll = () => {
    setSelectedAssignmentIds(new Set());
    setBoxPlotView("per-assignment");
  };

  // Filter assignment comparison data based on selection
  const filteredAssignmentComparison = assignmentComparison?.filter(
    (a) => isAllSelected || selectedAssignmentIds.has(a.assignmentId),
  );

  // Loading state
  if (classAnalytics === undefined) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading analytics...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // No data state
  if (!classAnalytics?.hasData) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="rounded-full bg-muted p-3 mb-3">
              <BarChart3 className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-medium mb-1">No Student Data Yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Analytics will appear here once students start working on your
              assignments. Share the assignment link with your students to get
              started.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isLoading = isSingleSelected && assignmentAnalytics === undefined;

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "students", label: "Students" },
  ];

  // Get display label for selector
  const getSelectorLabel = () => {
    if (isAllSelected) return "All Assignments";
    if (isSingleSelected) {
      const assignment = publishedAssignments.find(
        (a) => a._id === singleSelectedId,
      );
      return assignment?.name || "1 Assignment";
    }
    return `${selectedAssignmentIds.size} Assignments`;
  };

  return (
    <div className="space-y-4">
      {/* Header with assignment selector and tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">View:</span>

          {/* Multi-select dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2 px-3 py-2 text-sm border rounded-md bg-background hover:bg-muted/50 min-w-[200px] justify-between"
            >
              <span className="truncate">{getSelectorLabel()}</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  isDropdownOpen && "rotate-180",
                )}
              />
            </button>

            {isDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setIsDropdownOpen(false)}
                />
                <div className="absolute top-full left-0 mt-1 w-64 bg-background border rounded-md shadow-lg z-20 py-1 max-h-64 overflow-y-auto">
                  <button
                    onClick={() => {
                      selectAll();
                      setIsDropdownOpen(false);
                    }}
                    className={cn(
                      "w-full px-3 py-2 text-sm text-left hover:bg-muted/50 flex items-center gap-2",
                      isAllSelected && "bg-muted/30",
                    )}
                  >
                    <div
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                        isAllSelected
                          ? "bg-primary border-primary"
                          : "border-muted-foreground",
                      )}
                    >
                      {isAllSelected && (
                        <Check className="h-3 w-3 text-primary-foreground" />
                      )}
                    </div>
                    All Assignments
                  </button>
                  <div className="h-px bg-border my-1" />
                  {publishedAssignments.map((assignment) => {
                    const isChecked = selectedAssignmentIds.has(assignment._id);
                    return (
                      <button
                        key={assignment._id}
                        onClick={() => toggleAssignment(assignment._id)}
                        className="w-full px-3 py-2 text-sm text-left hover:bg-muted/50 flex items-center gap-2"
                      >
                        <div
                          className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                            isChecked
                              ? "bg-primary border-primary"
                              : "border-muted-foreground",
                          )}
                        >
                          {isChecked && (
                            <Check className="h-3 w-3 text-primary-foreground" />
                          )}
                        </div>
                        <span className="truncate">{assignment.name}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex rounded-lg bg-muted p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state for assignment analytics */}
      {isLoading && (
        <Card>
          <CardContent className="py-8">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading assignment data...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overview Tab */}
      {activeTab === "overview" && !isLoading && (
        <div className="space-y-6">
          {/* Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              title="Total Students"
              value={
                isSingleSelected
                  ? (assignmentAnalytics?.totalStudents ?? 0)
                  : classAnalytics.totalStudents
              }
              subtitle={
                isAllSelected
                  ? `across ${publishedAssignments.length} assignments`
                  : undefined
              }
              icon={<Users className="h-4 w-4" />}
            />
            <MetricCard
              title="Completion Rate"
              value={`${Math.round(
                (isSingleSelected
                  ? (assignmentAnalytics?.completionRate ?? 0)
                  : classAnalytics.overallCompletionRate) * 100,
              )}%`}
              subtitle="questions solved"
              icon={<CheckCircle className="h-4 w-4" />}
            />
            <MetricCard
              title={
                defaultMetric === "mean" ? "Avg Messages" : "Median Messages"
              }
              value={
                isSingleSelected
                  ? ((defaultMetric === "mean"
                      ? assignmentAnalytics?.messagesBoxPlot?.mean.toFixed(1)
                      : assignmentAnalytics?.messagesBoxPlot?.median.toFixed(
                          1,
                        )) ?? "—")
                  : defaultMetric === "mean"
                    ? classAnalytics.avgMessagesPerQuestion.toFixed(1)
                    : (classAnalytics.allMessagesBoxPlot?.median.toFixed(1) ??
                      "—")
              }
              subtitle="per question"
              icon={<MessageSquare className="h-4 w-4" />}
            />
            <MetricCard
              title={defaultMetric === "mean" ? "Avg Time" : "Median Time"}
              value={formatTime(
                isSingleSelected
                  ? ((defaultMetric === "mean"
                      ? assignmentAnalytics?.timeBoxPlot?.mean
                      : assignmentAnalytics?.timeBoxPlot?.median) ?? 0)
                  : defaultMetric === "mean"
                    ? classAnalytics.avgTimePerQuestionMs
                    : (classAnalytics.allTimesBoxPlot?.median ?? 0),
              )}
              subtitle="per question"
              icon={<Clock className="h-4 w-4" />}
            />
          </div>

          {/* Box Plot View Selector - only show relevant options */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Distribution view:
            </span>
            <div className="flex rounded-lg bg-muted p-1">
              {isSingleSelected && (
                <button
                  onClick={() => setBoxPlotView("per-question")}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                    boxPlotView === "per-question"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Per Question
                </button>
              )}
              <button
                onClick={() => setBoxPlotView("per-assignment")}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                  boxPlotView === "per-assignment"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Per Assignment
              </button>
              {(isAllSelected || isMultiSelected) && (
                <button
                  onClick={() => setBoxPlotView("all")}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                    boxPlotView === "all"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  All Assignments
                </button>
              )}
            </div>
          </div>

          {/* Box Plots - stacked vertically */}
          <div className="space-y-2">
            {boxPlotView === "per-question" && questionBoxPlots && (
              <>
                <HorizontalBoxPlot
                  title="Messages per Question"
                  data={questionBoxPlots.map((q) => ({
                    name: `Q${q.questionNumber}`,
                    boxPlot: q.messagesBoxPlot,
                  }))}
                  formatValue={(v) => v.toFixed(1)}
                  color="#6366f1"
                  unit=" msgs"
                  showOutliers={false}
                />
                <HorizontalBoxPlot
                  title="Time per Question"
                  data={questionBoxPlots.map((q) => ({
                    name: `Q${q.questionNumber}`,
                    boxPlot: q.timeBoxPlot
                      ? {
                          ...q.timeBoxPlot,
                          min: q.timeBoxPlot.min / 1000,
                          q1: q.timeBoxPlot.q1 / 1000,
                          median: q.timeBoxPlot.median / 1000,
                          q3: q.timeBoxPlot.q3 / 1000,
                          max: q.timeBoxPlot.max / 1000,
                          mean: q.timeBoxPlot.mean / 1000,
                        }
                      : null,
                  }))}
                  formatValue={(v) => v.toFixed(0)}
                  color="#10b981"
                  unit="s"
                  showOutliers={false}
                />
              </>
            )}

            {boxPlotView === "per-assignment" &&
              filteredAssignmentComparison && (
                <>
                  <HorizontalBoxPlot
                    title="Messages per Assignment"
                    data={filteredAssignmentComparison.map((a) => ({
                      name:
                        a.assignmentName.length > 20
                          ? a.assignmentName.slice(0, 20) + "..."
                          : a.assignmentName,
                      boxPlot: a.messagesBoxPlot,
                    }))}
                    formatValue={(v) => v.toFixed(1)}
                    color="#6366f1"
                    unit=" msgs"
                    showOutliers={false}
                  />
                  <HorizontalBoxPlot
                    title="Time per Assignment"
                    data={filteredAssignmentComparison.map((a) => ({
                      name:
                        a.assignmentName.length > 20
                          ? a.assignmentName.slice(0, 20) + "..."
                          : a.assignmentName,
                      boxPlot: a.timeBoxPlot
                        ? {
                            ...a.timeBoxPlot,
                            min: a.timeBoxPlot.min / 1000,
                            q1: a.timeBoxPlot.q1 / 1000,
                            median: a.timeBoxPlot.median / 1000,
                            q3: a.timeBoxPlot.q3 / 1000,
                            max: a.timeBoxPlot.max / 1000,
                            mean: a.timeBoxPlot.mean / 1000,
                          }
                        : null,
                    }))}
                    formatValue={(v) => v.toFixed(0)}
                    color="#10b981"
                    unit="s"
                    showOutliers={false}
                  />
                </>
              )}

            {boxPlotView === "all" && classAnalytics && (
              <>
                <HorizontalBoxPlot
                  title="Messages (All Assignments)"
                  data={[
                    {
                      name: "All Data",
                      boxPlot: classAnalytics.allMessagesBoxPlot,
                    },
                  ]}
                  formatValue={(v) => v.toFixed(1)}
                  color="#6366f1"
                  unit=" msgs"
                  showOutliers={false}
                />
                <HorizontalBoxPlot
                  title="Time (All Assignments)"
                  data={[
                    {
                      name: "All Data",
                      boxPlot: classAnalytics.allTimesBoxPlot
                        ? {
                            ...classAnalytics.allTimesBoxPlot,
                            min: classAnalytics.allTimesBoxPlot.min / 1000,
                            q1: classAnalytics.allTimesBoxPlot.q1 / 1000,
                            median:
                              classAnalytics.allTimesBoxPlot.median / 1000,
                            q3: classAnalytics.allTimesBoxPlot.q3 / 1000,
                            max: classAnalytics.allTimesBoxPlot.max / 1000,
                            mean: classAnalytics.allTimesBoxPlot.mean / 1000,
                          }
                        : null,
                    },
                  ]}
                  formatValue={(v) => v.toFixed(0)}
                  color="#10b981"
                  unit="s"
                  showOutliers={false}
                />
              </>
            )}
          </div>

          {/* Question Analysis - shown when single assignment selected */}
          {isSingleSelected && assignmentAnalytics && (
            <QuestionDifficultyTable
              questions={assignmentAnalytics.questionStats}
              struggleQuestionIds={assignmentAnalytics.struggleQuestions}
              sortField={questionSortField}
              sortDirection={questionSortDirection}
              onSortChange={(field, direction) => {
                setQuestionSortField(field);
                setQuestionSortDirection(direction);
                Cookies.set("agar_question_sort_field", field, {
                  expires: 365,
                });
                Cookies.set("agar_question_sort_dir", direction, {
                  expires: 365,
                });
              }}
            />
          )}
        </div>
      )}

      {/* Students Tab */}
      {activeTab === "students" && !isLoading && (
        <div>
          {isSingleSelected && studentPerformance ? (
            // Show per-assignment view when a single assignment is selected
            <StudentPerformanceTable students={studentPerformance} />
          ) : allStudents ? (
            // Show all students across all assignments
            <AllStudentsTable students={allStudents} />
          ) : (
            <Card>
              <CardContent className="py-8">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading student data...</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
