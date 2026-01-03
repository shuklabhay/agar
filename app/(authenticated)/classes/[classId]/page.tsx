"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  ArrowLeft,
  Plus,
  FileText,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function ClassDetailPage() {
  const params = useParams();
  const classId = params.classId as Id<"classes">;
  const classData = useQuery(api.classes.getClass, { classId });
  const assignments = useQuery(api.assignments.listAssignments, { classId });

  if (classData === undefined || assignments === undefined) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading class...</p>
        </div>
      </div>
    );
  }

  if (classData === null) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <div className="rounded-full bg-muted p-4">
          <BookOpen className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold">Class not found</h2>
        <p className="text-muted-foreground">
          This class doesn&apos;t exist or you don&apos;t have access to it.
        </p>
        <Button asChild>
          <Link href="/classes">
            <ArrowLeft className="h-4 w-4" />
            Back to Classes
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" asChild className="mt-1">
          <Link href="/classes">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {classData.name}
            </h1>
            {classData.section && (
              <Badge variant="secondary" className="text-sm">
                {classData.section}
              </Badge>
            )}
          </div>
        </div>
        <Button asChild>
          <Link href={`/classes/${classId}/new-assignment`}>
            <Plus className="h-4 w-4" />
            Create Assignment
          </Link>
        </Button>
      </div>

      {/* Assignments Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Assignments</h2>

        {assignments.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="rounded-full bg-muted p-4 mb-4">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1">No assignments yet</h3>
              <p className="text-muted-foreground text-center max-w-sm mb-4">
                Create your first assignment to start sharing materials with
                students.
              </p>
              <Button asChild>
                <Link href={`/classes/${classId}/new-assignment`}>
                  <Plus className="h-4 w-4" />
                  Create Your First Assignment
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {assignments.map((assignment) => (
              <Link
                key={assignment._id}
                href={
                  assignment.isDraft
                    ? `/classes/${classId}/new-assignment`
                    : `/classes/${classId}/${assignment._id}`
                }
                className="group"
              >
                <Card
                  className={`transition-all hover:shadow-md hover:border-primary/50 group-hover:bg-muted/30 ${
                    assignment.isDraft ? "border-dashed border-2" : ""
                  }`}
                >
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="rounded-lg bg-muted p-2">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold group-hover:text-primary transition-colors truncate">
                          {assignment.name}
                        </h3>
                        {assignment.isDraft && (
                          <Badge variant="outline" className="text-xs">
                            Draft
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {assignment.assignmentFilesCount} assignment file
                        {assignment.assignmentFilesCount !== 1 ? "s" : ""},{" "}
                        {assignment.notesFilesCount} note
                        {assignment.notesFilesCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
