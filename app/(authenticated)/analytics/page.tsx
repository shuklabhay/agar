"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClassAnalyticsDashboard } from "../classes/[classId]/_components/analytics/ClassAnalyticsDashboard";

export default function AnalyticsPage() {
  const [selectedClassId, setSelectedClassId] = useState<Id<"classes"> | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const classes = useQuery(api.classes.listClasses);

  // Auto-select first class if none selected (derived state)
  const effectiveClassId = selectedClassId ?? (classes && classes.length > 0 ? classes[0]._id : null);

  const assignments = useQuery(
    api.assignments.listAssignments,
    effectiveClassId ? { classId: effectiveClassId } : "skip"
  );

  const selectedClass = classes?.find((c) => c._id === effectiveClassId);

  if (classes === undefined) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">
            View student performance and engagement metrics
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <BarChart3 className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No classes yet</h3>
            <p className="text-muted-foreground text-center max-w-sm">
              Create a class and some assignments to start viewing analytics.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">
            View student performance and engagement metrics
          </p>
        </div>

        {/* Class Selector */}
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 px-4 py-2 text-sm border rounded-md bg-background hover:bg-muted/50 min-w-[200px] justify-between"
          >
            <span className="truncate font-medium">
              {selectedClass?.name ?? "Select a class"}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform shrink-0",
                isDropdownOpen && "rotate-180"
              )}
            />
          </button>

          {isDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsDropdownOpen(false)}
              />
              <div className="absolute top-full right-0 mt-1 w-64 bg-background border rounded-md shadow-lg z-20 py-1 max-h-64 overflow-y-auto">
                {classes.map((classItem) => {
                  const isSelected = classItem._id === effectiveClassId;
                  return (
                    <button
                      key={classItem._id}
                      onClick={() => {
                        setSelectedClassId(classItem._id);
                        setIsDropdownOpen(false);
                      }}
                      className={cn(
                        "w-full px-3 py-2 text-sm text-left hover:bg-muted/50 flex items-center gap-2",
                        isSelected && "bg-muted/30"
                      )}
                    >
                      <div
                        className={cn(
                          "w-4 h-4 rounded-full border flex items-center justify-center shrink-0",
                          isSelected
                            ? "bg-primary border-primary"
                            : "border-muted-foreground"
                        )}
                      >
                        {isSelected && (
                          <Check className="h-3 w-3 text-primary-foreground" />
                        )}
                      </div>
                      <span className="truncate">{classItem.name}</span>
                      {classItem.section && (
                        <span className="text-xs text-muted-foreground ml-auto">
                          {classItem.section}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Analytics Dashboard */}
      {effectiveClassId && assignments !== undefined && (
        <ClassAnalyticsDashboard
          classId={effectiveClassId}
          assignments={assignments}
        />
      )}

      {/* Loading state for assignments */}
      {effectiveClassId && assignments === undefined && (
        <Card>
          <CardContent className="py-12">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>Loading analytics...</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
