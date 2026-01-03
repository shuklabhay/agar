"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BookOpen, User, Clock } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";

interface ExistingStudent {
  _id: Id<"studentSessions">;
  name: string;
  lastActiveAt: number;
}

interface WelcomeDialogProps {
  open: boolean;
  assignmentName: string;
  className: string;
  existingStudents: ExistingStudent[];
  onStartNew: (name: string) => void;
  onResume: (sessionId: Id<"studentSessions">) => void;
  isLoading?: boolean;
}

function formatLastActive(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export function WelcomeDialog({
  open,
  assignmentName,
  className,
  existingStudents,
  onStartNew,
  onResume,
  isLoading = false,
}: WelcomeDialogProps) {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isLoading) return;
    onStartNew(name.trim());
  };

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader className="text-center items-center">
          <div className="mx-auto rounded-full bg-primary/10 p-3 w-fit mb-2">
            <BookOpen className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-xl">Welcome!</DialogTitle>
          <DialogDescription className="text-center">
            <span className="font-medium text-foreground">{assignmentName}</span>
            <br />
            <span className="text-muted-foreground">{className}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 mt-4">
          <div className="space-y-2">
            <Input
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="text-center"
              disabled={isLoading}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={!name.trim() || isLoading}
            >
              {isLoading ? "Starting..." : "Start Learning"}
            </Button>
          </div>
        </form>

        {existingStudents.length > 0 && (
          <>
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  or continue as
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 justify-center">
              {existingStudents.slice(0, 6).map((student) => (
                <button
                  key={student._id}
                  onClick={() => onResume(student._id)}
                  disabled={isLoading}
                  className="group flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                >
                  <User className="h-3.5 w-3.5" />
                  <span className="font-medium">{student.name}</span>
                  <span className="text-xs text-muted-foreground group-hover:text-primary-foreground/70 flex items-center gap-0.5">
                    <Clock className="h-3 w-3" />
                    {formatLastActive(student.lastActiveAt)}
                  </span>
                </button>
              ))}
            </div>

            {existingStudents.length > 6 && (
              <p className="text-xs text-muted-foreground text-center">
                +{existingStudents.length - 6} more students
              </p>
            )}
          </>
        )}

        <p className="text-xs text-muted-foreground text-center mt-2">
          Your progress will be saved to this device
        </p>
      </DialogContent>
    </Dialog>
  );
}
