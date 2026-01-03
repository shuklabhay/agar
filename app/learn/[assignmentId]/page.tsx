"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Cookies from "js-cookie";

import { WelcomeDialog } from "./_components/WelcomeDialog";
import { QuestionPanel } from "./_components/QuestionPanel";
import { ChatPanel } from "./_components/ChatPanel";
import { ProgressBar } from "./_components/ProgressBar";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, Loader2, AlertCircle } from "lucide-react";

const COOKIE_PREFIX = "agar_session_";

export default function LearnPage() {
  const params = useParams();
  const assignmentId = params.assignmentId as Id<"assignments">;

  // Session state
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<Id<"studentSessions"> | null>(null);
  const [showWelcome, setShowWelcome] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  // Question navigation
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // Resizable panels
  const [leftPanelWidth, setLeftPanelWidth] = useState(50); // percentage
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
    // Clamp between 25% and 75%
    setLeftPanelWidth(Math.min(75, Math.max(25, newWidth)));
  }, []);

  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Queries
  const assignment = useQuery(api.studentSessions.getAssignmentForStudent, {
    assignmentId,
  });
  const existingStudents = useQuery(api.studentSessions.getExistingStudents, {
    assignmentId,
  });
  const session = useQuery(
    api.studentSessions.getSession,
    sessionToken ? { sessionToken } : "skip"
  );
  const questions = useQuery(
    api.studentProgress.getQuestionsForStudent,
    sessionId ? { assignmentId } : "skip"
  );
  const progress = useQuery(
    api.studentProgress.getProgress,
    sessionId ? { sessionId } : "skip"
  );

  // Mutations
  const startSession = useMutation(api.studentSessions.startSession);
  const resumeSession = useMutation(api.studentSessions.resumeSession);
  const updateLastQuestionIndex = useMutation(api.studentSessions.updateLastQuestionIndex);
  const recordTimeSpent = useMutation(api.studentProgress.recordTimeSpent);
  const restartTimeTracking = useMutation(api.studentProgress.restartTimeTracking);

  // Check for existing session cookie on mount
  useEffect(() => {
    const token = Cookies.get(`${COOKIE_PREFIX}${assignmentId}`);
    if (token) {
      setSessionToken(token);
    }
  }, [assignmentId]);

  // Track if we've restored the question index
  const hasRestoredIndex = useRef(false);

  // Track previous question for time recording
  const previousQuestionId = useRef<Id<"questions"> | null>(null);

  // Sync session from query result
  useEffect(() => {
    if (session) {
      setSessionId(session._id);
      setShowWelcome(false);
      // Restore last question index if available and not already restored
      if (!hasRestoredIndex.current) {
        if (session.lastQuestionIndex !== undefined) {
          setCurrentQuestionIndex(session.lastQuestionIndex);
        }
        hasRestoredIndex.current = true;
      }
    } else if (sessionToken && session === null) {
      // Token is invalid, clear it
      Cookies.remove(`${COOKIE_PREFIX}${assignmentId}`);
      setSessionToken(null);
      setShowWelcome(true);
      hasRestoredIndex.current = false;
    }
  }, [session, sessionToken, assignmentId]);

  // Save question index when it changes
  useEffect(() => {
    if (sessionId && hasRestoredIndex.current) {
      updateLastQuestionIndex({ sessionId, questionIndex: currentQuestionIndex });
    }
  }, [sessionId, currentQuestionIndex, updateLastQuestionIndex]);

  // Record time spent when switching questions or leaving page
  useEffect(() => {
    const currentQId = questions?.[currentQuestionIndex]?._id;

    // Record time for previous question when switching
    if (sessionId && previousQuestionId.current && previousQuestionId.current !== currentQId) {
      recordTimeSpent({ sessionId, questionId: previousQuestionId.current });
    }

    // Update ref to current question
    previousQuestionId.current = currentQId ?? null;
  }, [sessionId, currentQuestionIndex, questions, recordTimeSpent]);

  // Record time when leaving the page or switching tabs
  useEffect(() => {
    const recordCurrentTime = () => {
      if (sessionId && previousQuestionId.current) {
        const payload = JSON.stringify({
          sessionId,
          questionId: previousQuestionId.current,
        });
        // Convex HTTP endpoint URL
        const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.replace(".cloud", ".site");
        if (convexUrl) {
          navigator.sendBeacon(`${convexUrl}/record-time`, payload);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // Tab hidden - record time spent
        recordCurrentTime();
      } else if (document.visibilityState === "visible" && sessionId && previousQuestionId.current) {
        // Tab visible again - restart time tracking
        restartTimeTracking({ sessionId, questionId: previousQuestionId.current });
      }
    };

    window.addEventListener("beforeunload", recordCurrentTime);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", recordCurrentTime);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [sessionId, restartTimeTracking]);

  // Handle starting a new session
  const handleStartNew = async (name: string) => {
    setIsStarting(true);
    try {
      const result = await startSession({
        assignmentId,
        studentName: name,
      });
      // Save token to cookie (30 day expiry)
      Cookies.set(`${COOKIE_PREFIX}${assignmentId}`, result.sessionToken, {
        expires: 30,
      });
      setSessionToken(result.sessionToken);
      setSessionId(result.sessionId);
      setShowWelcome(false);
    } catch (error) {
      console.error("Failed to start session:", error);
    } finally {
      setIsStarting(false);
    }
  };

  // Handle resuming an existing session
  const handleResume = async (existingSessionId: Id<"studentSessions">) => {
    setIsStarting(true);
    try {
      const result = await resumeSession({ sessionId: existingSessionId });
      // Save new token to cookie
      Cookies.set(`${COOKIE_PREFIX}${assignmentId}`, result.sessionToken, {
        expires: 30,
      });
      setSessionToken(result.sessionToken);
      setSessionId(result.sessionId);
      setShowWelcome(false);
    } catch (error) {
      console.error("Failed to resume session:", error);
    } finally {
      setIsStarting(false);
    }
  };

  // Loading state
  if (assignment === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading assignment...</span>
        </div>
      </div>
    );
  }

  // Assignment not found or not ready
  if (assignment === null) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-destructive/10 p-4 mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h1 className="text-xl font-semibold mb-2">Assignment Not Available</h1>
            <p className="text-muted-foreground text-center">
              This assignment doesn't exist or isn't ready for students yet.
              Please check with your teacher.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Current question data
  const currentQuestion = questions?.[currentQuestionIndex];
  const currentProgress = progress?.find(
    (p) => p.questionId === currentQuestion?._id
  );

  // Show welcome dialog if no session
  if (showWelcome || !sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <WelcomeDialog
          open={true}
          assignmentName={assignment.name}
          className={assignment.className}
          existingStudents={existingStudents ?? []}
          onStartNew={handleStartNew}
          onResume={handleResume}
          isLoading={isStarting}
        />
      </div>
    );
  }

  // Main learning interface
  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b px-4 py-3 bg-background shrink-0">
        <div className="max-w-7xl mx-auto space-y-2">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-semibold">{assignment.name}</h1>
            <span className="text-xs text-muted-foreground">
              {assignment.className}
            </span>
          </div>
          <ProgressBar
            questions={questions ?? []}
            progress={progress ?? []}
            currentIndex={currentQuestionIndex}
            onQuestionClick={setCurrentQuestionIndex}
          />
        </div>
      </header>

      {/* Main content - split panel */}
      <main ref={containerRef} className="flex-1 flex overflow-hidden">
        {/* Left Panel - Question */}
        <div
          className="overflow-y-auto bg-background"
          style={{ width: `${leftPanelWidth}%` }}
        >
          <QuestionPanel
            question={currentQuestion}
            progress={currentProgress}
            questionIndex={currentQuestionIndex}
            totalQuestions={questions?.length ?? 0}
            onPrevious={() =>
              setCurrentQuestionIndex((i) => Math.max(0, i - 1))
            }
            onNext={() =>
              setCurrentQuestionIndex((i) =>
                Math.min((questions?.length ?? 1) - 1, i + 1)
              )
            }
            sessionId={sessionId}
          />
        </div>

        {/* Draggable Divider */}
        <div
          onMouseDown={handleMouseDown}
          className="w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors shrink-0 relative group"
        >
          <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-primary/10" />
        </div>

        {/* Right Panel - Chat */}
        <div
          className="overflow-hidden bg-muted/20"
          style={{ width: `${100 - leftPanelWidth}%` }}
        >
          <ChatPanel
            sessionId={sessionId}
            questionId={currentQuestion?._id}
            question={currentQuestion}
            questions={questions ?? []}
          />
        </div>
      </main>
    </div>
  );
}
