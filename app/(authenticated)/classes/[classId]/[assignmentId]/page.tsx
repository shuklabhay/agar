"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  Download,
  Copy,
  Check,
  Link as LinkIcon,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useState } from "react";

export default function AssignmentDetailPage() {
  const params = useParams();
  const classId = params.classId as Id<"classes">;
  const assignmentId = params.assignmentId as Id<"assignments">;

  const classData = useQuery(api.classes.getClass, { classId });
  const assignment = useQuery(api.assignments.getAssignment, { assignmentId });

  const [copied, setCopied] = useState(false);

  const studentLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/learn/${assignmentId}`
      : `/learn/${assignmentId}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(studentLink);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const getFileIcon = (contentType: string) => {
    if (contentType.startsWith("image/")) {
      return <ImageIcon className="h-5 w-5" />;
    }
    return <FileText className="h-5 w-5" />;
  };

  const getFileTypeBadge = (contentType: string) => {
    switch (contentType) {
      case "image/jpeg":
        return "JPEG";
      case "image/png":
        return "PNG";
      case "application/pdf":
        return "PDF";
      default:
        return "File";
    }
  };

  if (classData === undefined || assignment === undefined) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (classData === null || assignment === null) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-semibold">Assignment not found</h2>
        <p className="text-muted-foreground">
          This assignment doesn&apos;t exist or you don&apos;t have access to it.
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
          <Link href={`/classes/${classId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">{classData.name}</p>
          <h1 className="text-3xl font-bold tracking-tight">{assignment.name}</h1>
        </div>
      </div>

      {/* Student Link Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <LinkIcon className="h-5 w-5" />
            Student Link
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Share this link with students to access the assignment materials.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono break-all">
              {studentLink}
            </code>
            <Button variant="outline" size="icon" onClick={handleCopyLink}>
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button variant="outline" size="icon" asChild>
              <a href={studentLink} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notes Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">
          Notes ({assignment.notes.length})
        </h2>

        {assignment.notes.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No notes uploaded</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {assignment.notes.map((note, index) => (
              <Card key={index} className="overflow-hidden">
                <CardContent className="p-0">
                  {/* Preview for images */}
                  {note.contentType.startsWith("image/") && note.url && (
                    <div className="aspect-video bg-muted relative overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={note.url}
                        alt={note.fileName}
                        className="object-cover w-full h-full"
                      />
                    </div>
                  )}

                  {/* PDF preview placeholder */}
                  {note.contentType === "application/pdf" && (
                    <div className="aspect-video bg-muted flex items-center justify-center">
                      <FileText className="h-16 w-16 text-muted-foreground" />
                    </div>
                  )}

                  {/* File info */}
                  <div className="flex items-center gap-3 p-3">
                    {getFileIcon(note.contentType)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{note.fileName}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {getFileTypeBadge(note.contentType)}
                    </Badge>
                    {note.url && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                        <a href={note.url} download={note.fileName} target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
