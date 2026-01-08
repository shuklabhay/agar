"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Cookies from "js-cookie";

import { WelcomeDialog } from "./_components/WelcomeDialog";
import { QuestionPanel } from "./_components/QuestionPanel";
import { ChatPanel } from "./_components/ChatPanel";
import { ProgressBar } from "./_components/ProgressBar";
import { CompletionCelebration } from "./_components/CompletionCelebration";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { BookOpen, Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import { useResizablePanel } from "@/hooks/use-resizable-panel";

const COOKIE_PREFIX = "agar_session_";

export default function LearnPage() {
  const params = useParams();
  const assignmentId = params.assignmentId as Id<"assignments">;
  const router = useRouter();
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();

  // Session state
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<Id<"studentSessions"> | null>(
    null,
  );
  const [teacherSessionId, setTeacherSessionId] =
    useState<Id<"studentSessions"> | null>(null);
  const [isCreatingTeacherSession, setIsCreatingTeacherSession] =
    useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [hasShownCelebration, setHasShownCelebration] = useState(false);
  const [showIdentityConfirm, setShowIdentityConfirm] = useState(false);
  const [showStudentSwitchConfirm, setShowStudentSwitchConfirm] =
    useState(false);

  // Question navigation
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const lastCorrectQuestionRef = useRef<string | null>(null);
  const previousStatusMapRef = useRef<Map<string, string>>(new Map());
  const questionScrollRef = useRef<HTMLDivElement | null>(null);
  const completedQuestionsRef = useRef<Set<Id<"questions">>>(new Set());

  // Resizable panels
  const { containerRef, leftPanelWidth, handleMouseDown } = useResizablePanel({
    defaultSize: 50,
    minSize: 25,
    maxSize: 75,
  });
  const [isMobile, setIsMobile] = useState(false);

  // Queries
  const assignment = useQuery(api.studentSessions.getAssignmentForStudent, {
    assignmentId,
  });
  const teacherPreview = useQuery(
    api.studentSessions.getTeacherPreviewSession,
    isAuthenticated ? { assignmentId } : "skip",
  );
  const isTeacherView = Boolean(isAuthenticated && teacherPreview?.isTeacher);
  const existingStudents = useQuery(
    api.studentSessions.getExistingStudents,
    isTeacherView ? "skip" : { assignmentId },
  );
  const session = useQuery(
    api.studentSessions.getSession,
    !isTeacherView && sessionToken ? { sessionToken } : "skip",
  );
  const activeSessionId = isTeacherView ? teacherSessionId : sessionId;
  const sessionData = useQuery(
    api.studentProgress.getSessionData,
    activeSessionId ? { sessionId: activeSessionId } : "skip",
  );
  const questions = sessionData?.questions;
  const progress = sessionData?.progress;

  const completedQuestions = useMemo(() => {
    const previous = completedQuestionsRef.current;
    const next = new Set(previous);
    let changed = false;

    if (progress) {
      for (const entry of progress) {
        if (entry.status === "correct" && !next.has(entry.questionId)) {
          next.add(entry.questionId);
          changed = true;
        }
      }
    }

    if (changed) {
      completedQuestionsRef.current = next;
      return next;
    }

    return previous;
  }, [progress]);

  const totalQuestions = questions?.length ?? 0;
  const correctCount =
    progress?.filter((p) => p.status === "correct").length ?? 0;
  const allQuestionsComplete =
    totalQuestions > 0 && correctCount === totalQuestions;

  const questionPanelStyle = useMemo(
    () =>
      isMobile
        ? { flexBasis: "55%" }
        : {
            flexBasis: `${leftPanelWidth}%`,
          },
    [isMobile, leftPanelWidth],
  );
  const chatPanelStyle = useMemo(
    () =>
      isMobile
        ? { flexBasis: "45%" }
        : {
            flexBasis: `${100 - leftPanelWidth}%`,
          },
    [isMobile, leftPanelWidth],
  );

  // Mutations
  const startSession = useMutation(api.studentSessions.startSession);
  const resumeSession = useMutation(api.studentSessions.resumeSession);
  const startTeacherPreviewSession = useMutation(
    api.studentSessions.startTeacherPreviewSession,
  );
  const recordTimeSpent = useMutation(api.studentProgress.recordTimeSpent);
  const restartTimeTracking = useMutation(
    api.studentProgress.restartTimeTracking,
  );

  // Check for existing session cookie on mount
  useEffect(() => {
    if (isTeacherView) return;
    const token = Cookies.get(`${COOKIE_PREFIX}${assignmentId}`);
    if (token) {
      setSessionToken(token);
    }
  }, [assignmentId, isTeacherView]);

  // Track if we've set the initial question index
  const hasSetInitialIndex = useRef(false);
  const teacherSessionRequested = useRef(false);

  // Track previous question for time recording
  const previousQuestionId = useRef<Id<"questions"> | null>(null);

  useEffect(() => {
    hasSetInitialIndex.current = false;
    lastCorrectQuestionRef.current = null;
    previousQuestionId.current = null;
    previousStatusMapRef.current = new Map();
    completedQuestionsRef.current = new Set<Id<"questions">>();
  }, [activeSessionId]);

  // Track viewport size to switch to stacked layout on small screens
  useEffect(() => {
    const updateIsMobile = () => setIsMobile(window.innerWidth < 768);
    updateIsMobile();
    window.addEventListener("resize", updateIsMobile);
    return () => window.removeEventListener("resize", updateIsMobile);
  }, []);

  // Sync session from query result
  useEffect(() => {
    if (isTeacherView) return;
    if (session) {
      setSessionId(session._id);
      setShowWelcome(false);
    } else if (sessionToken && session === null) {
      // Token is invalid, clear it
      Cookies.remove(`${COOKIE_PREFIX}${assignmentId}`);
      setSessionToken(null);
      setShowWelcome(true);
      hasSetInitialIndex.current = false;
    }
  }, [session, sessionToken, assignmentId, isTeacherView]);

  // Start or reuse a teacher preview session when applicable
  useEffect(() => {
    if (!isTeacherView) {
      setTeacherSessionId(null);
      teacherSessionRequested.current = false;
      return;
    }

    if (!assignment || teacherPreview === undefined) return;

    const existingTeacherSessionId =
      teacherPreview.sessionId ?? teacherSessionId;

    if (existingTeacherSessionId) {
      setTeacherSessionId(existingTeacherSessionId);
      setShowWelcome(false);
      teacherSessionRequested.current = false;
      return;
    }

    if (
      teacherSessionRequested.current ||
      isCreatingTeacherSession ||
      teacherSessionId
    )
      return;

    teacherSessionRequested.current = true;
    setIsCreatingTeacherSession(true);
    startTeacherPreviewSession({ assignmentId })
      .then((result) => {
        setTeacherSessionId(result.sessionId);
        setShowWelcome(false);
      })
      .catch((error) => {
        console.error("Failed to start teacher preview session:", error);
      })
      .finally(() => {
        setIsCreatingTeacherSession(false);
        teacherSessionRequested.current = false;
      });
  }, [
    assignment,
    assignmentId,
    isCreatingTeacherSession,
    isTeacherView,
    startTeacherPreviewSession,
    teacherPreview,
    teacherSessionId,
  ]);

  // Set initial question to earliest not-correct question
  useEffect(() => {
    if (!questions || !progress || hasSetInitialIndex.current) return;

    // Find the first question that is not correct
    const firstIncompleteIndex = questions.findIndex((q) => {
      const questionProgress = progress.find((p) => p.questionId === q._id);
      return !questionProgress || questionProgress.status !== "correct";
    });

    if (firstIncompleteIndex !== -1) {
      setCurrentQuestionIndex(firstIncompleteIndex);
    }
    hasSetInitialIndex.current = true;
  }, [questions, progress]);

  // Auto-advance to next unanswered question when current question is answered correctly
  useEffect(() => {
    if (!questions || !progress) return;

    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    const currentProgress = progress.find(
      (p) => p.questionId === currentQuestion._id,
    );
    const currentStatus = currentProgress?.status;
    const previousStatus = previousStatusMapRef.current.get(
      currentQuestion._id,
    );

    // First time seeing this question in the map—initialize and exit early
    if (previousStatus === undefined) {
      previousStatusMapRef.current.set(
        currentQuestion._id,
        currentStatus ?? "unknown",
      );
      return;
    }

    // Check if this question just became correct
    if (
      currentStatus === "correct" &&
      previousStatus !== "correct" &&
      currentProgress &&
      currentProgress.advanceOnCorrect !== false &&
      lastCorrectQuestionRef.current !== currentQuestion._id
    ) {
      lastCorrectQuestionRef.current = currentQuestion._id;

      // Find next unanswered question (starting from current, then wrapping)
      const totalQuestions = questions.length;
      for (let offset = 1; offset < totalQuestions; offset++) {
        const nextIndex = (currentQuestionIndex + offset) % totalQuestions;
        const nextQuestion = questions[nextIndex];
        const nextProgress = progress.find(
          (p) => p.questionId === nextQuestion._id,
        );

        if (!nextProgress || nextProgress.status !== "correct") {
          // Found an unanswered question - advance after a short delay
          setTimeout(() => {
            setCurrentQuestionIndex(nextIndex);
          }, 1500);
          return;
        }
      }
      // All questions answered - stay on current
    }

    // Track status for transition detection
    previousStatusMapRef.current.set(
      currentQuestion._id,
      currentStatus ?? "unknown",
    );
  }, [questions, progress, currentQuestionIndex]);

  // Trigger celebration when everything is completed
  useEffect(() => {
    if (allQuestionsComplete && !hasShownCelebration) {
      setShowCelebration(true);
      setHasShownCelebration(true);
    }
  }, [allQuestionsComplete, hasShownCelebration]);

  // Reset celebration state if new questions appear or progress changes
  useEffect(() => {
    if (!allQuestionsComplete) {
      setShowCelebration(false);
      setHasShownCelebration(false);
    }
  }, [allQuestionsComplete]);

  const currentQuestionId = questions?.[currentQuestionIndex]?._id;

  // Reset scroll position when changing questions
  useEffect(() => {
    const scrollEl = questionScrollRef.current;
    if (!scrollEl) return;

    // Scroll immediately and then smooth in case layout shifts after render
    scrollEl.scrollTop = 0;
    scrollEl.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentQuestionIndex, currentQuestionId]);

  // Record time spent when switching questions or leaving page
  useEffect(() => {
    const currentQId = questions?.[currentQuestionIndex]?._id;

    // Record time for previous question when switching
    if (
      activeSessionId &&
      previousQuestionId.current &&
      previousQuestionId.current !== currentQId
    ) {
      recordTimeSpent({
        sessionId: activeSessionId,
        questionId: previousQuestionId.current,
      });
    }

    // Update ref to current question
    previousQuestionId.current = currentQId ?? null;
  }, [activeSessionId, currentQuestionIndex, questions, recordTimeSpent]);

  // Record time when leaving the page or switching tabs
  useEffect(() => {
    const recordCurrentTime = () => {
      if (activeSessionId && previousQuestionId.current) {
        const payload = JSON.stringify({
          sessionId: activeSessionId,
          questionId: previousQuestionId.current,
        });
        // Convex HTTP endpoint URL
        const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.replace(
          ".cloud",
          ".site",
        );
        if (convexUrl) {
          navigator.sendBeacon(`${convexUrl}/record-time`, payload);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // Tab hidden - record time spent
        recordCurrentTime();
      } else if (
        document.visibilityState === "visible" &&
        activeSessionId &&
        previousQuestionId.current
      ) {
        // Tab visible again - restart time tracking
        restartTimeTracking({
          sessionId: activeSessionId,
          questionId: previousQuestionId.current,
        });
      }
    };

    window.addEventListener("beforeunload", recordCurrentTime);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", recordCurrentTime);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeSessionId, restartTimeTracking]);

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
      setTeacherSessionId(null);
      setShowWelcome(false);
      setShowIdentityConfirm(true);
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
      setTeacherSessionId(null);
      setShowWelcome(false);
      setShowIdentityConfirm(true);
    } catch (error) {
      console.error("Failed to resume session:", error);
    } finally {
      setIsStarting(false);
    }
  };

  const handleLeavePage = async () => {
    if (isLeaving) return;
    setIsLeaving(true);

    try {
      if (activeSessionId && previousQuestionId.current) {
        await recordTimeSpent({
          sessionId: activeSessionId,
          questionId: previousQuestionId.current,
        });
      }
    } catch (error) {
      console.error("Failed to record time before leaving:", error);
    } finally {
      setShowLeaveConfirm(false);
      router.push("/");
    }
  };

  const handleSwitchStudent = () => {
    Cookies.remove(`${COOKIE_PREFIX}${assignmentId}`);
    setSessionToken(null);
    setSessionId(null);
    setTeacherSessionId(null);
    setShowWelcome(true);
    setShowIdentityConfirm(false);
    setShowStudentSwitchConfirm(false);
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

  // Assignment exists but isn't ready yet (processing or awaiting approval)
  if (assignment && assignment.isReady === false) {
    const status = assignment.processingStatus || "pending";
    const statusLabel: Record<string, string> = {
      pending: "Queued",
      extracting: "Extracting questions",
      generating_answers: "Generating answers",
      ready: "Awaiting teacher approval",
      error: "Processing error",
    };
    const friendlyStatus = statusLabel[status] || "Assignment processing";
    const detail =
      status === "error"
        ? assignment.processingError ||
          "Something went wrong while preparing this assignment."
        : "This assignment is still being processed. Please check back soon.";

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center space-y-3">
            <div className="rounded-full bg-primary/10 p-3">
              {status === "error" ? (
                <AlertCircle className="h-7 w-7 text-destructive" />
              ) : (
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              )}
            </div>
            <h1 className="text-xl font-semibold">
              {assignment.name || "Assignment"} is not ready yet
            </h1>
            <p className="text-sm font-medium text-muted-foreground">
              {friendlyStatus}
            </p>
            <p className="text-sm text-muted-foreground">{detail}</p>
          </CardContent>
        </Card>
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
            <h1 className="text-xl font-semibold mb-2">
              Assignment Not Available
            </h1>
            <p className="text-muted-foreground text-center">
              This assignment doesn&apos;t exist or isn&apos;t ready for
              students yet. Please check with your teacher.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const waitingForTeacherCheck =
    (isAuthLoading || (isAuthenticated && teacherPreview === undefined)) &&
    !sessionToken &&
    !activeSessionId;

  if (waitingForTeacherCheck) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Preparing your view...</span>
        </div>
      </div>
    );
  }

  if (isTeacherView && (!activeSessionId || isCreatingTeacherSession)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading teacher preview...</span>
        </div>
      </div>
    );
  }

  // Current question data
  const currentQuestion = questions?.[currentQuestionIndex];
  const currentProgress = progress?.find(
    (p) => p.questionId === currentQuestion?._id,
  );

  // Show welcome dialog if no session
  const shouldShowWelcome = !isTeacherView && (showWelcome || !activeSessionId);

  if (shouldShowWelcome) {
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
    <>
      <div className="h-screen flex flex-col bg-background">
        {isTeacherView && (
          <div className="bg-amber-100 border-b border-amber-200 text-amber-900 px-4 py-2">
            <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-sm font-medium text-center">
              <ShieldCheck className="h-4 w-4" />
              <span>
                Teacher mode — actions here don&apos;t affect student data or
                analytics.
              </span>
            </div>
          </div>
        )}
        {/* Header */}
        <header className="border-b px-4 py-2 bg-background shrink-0">
          <div className="w-full grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <AlertDialog
                  open={showLeaveConfirm}
                  onOpenChange={setShowLeaveConfirm}
                >
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setShowLeaveConfirm(true)}
                      className="rounded-md hover:bg-muted transition-colors"
                      aria-label="Back to landing"
                    >
                      <BookOpen className="h-5 w-5 text-primary" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Are you sure you want to leave?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Your session will pause and you'll be taken to the home
                        page.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isLeaving}>
                        Stay here
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleLeavePage}
                        disabled={isLeaving}
                      >
                        {isLeaving ? "Leaving..." : "Leave page"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <div className="flex items-baseline gap-2">
                  <h1 className="text-lg font-semibold leading-none">
                    {assignment.name}
                  </h1>
                  <span className="text-sm text-muted-foreground leading-none translate-y-[1px]">
                    {assignment.className}
                  </span>
                </div>
              </div>
              <ProgressBar
                questions={questions ?? []}
                progress={progress ?? []}
                currentIndex={currentQuestionIndex}
                onQuestionClick={setCurrentQuestionIndex}
              />
            </div>

            {!isTeacherView && activeSessionId && (
              <div className="flex items-center">
                <AlertDialog
                  open={showStudentSwitchConfirm}
                  onOpenChange={setShowStudentSwitchConfirm}
                >
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex flex-col items-end text-right text-sm leading-tight px-2 py-1 text-muted-foreground transition-colors whitespace-nowrap hover:text-primary"
                    >
                      <span className="text-sm font-semibold text-foreground leading-tight">
                        Not {sessionData?.session?.name || "you"}?
                      </span>
                      <span className="text-primary text-xs leading-tight">
                        Press here to switch
                      </span>
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Switch to a different student?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        You&apos;ll return to the student selection screen and
                        can choose the right name.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel
                        onClick={() => setShowStudentSwitchConfirm(false)}
                      >
                        Stay here
                      </AlertDialogCancel>
                      <AlertDialogAction onClick={handleSwitchStudent}>
                        Switch student
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        </header>

        {/* Main content - split panel */}
        <main
          ref={isMobile ? undefined : containerRef}
          className="flex-1 flex overflow-hidden flex-col md:flex-row"
        >
          {/* Top Panel (mobile) / Left Panel (desktop) - Question */}
          <div
            className="overflow-y-auto bg-background flex-shrink-0 w-full"
            ref={questionScrollRef}
            style={questionPanelStyle}
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
                  Math.min((questions?.length ?? 1) - 1, i + 1),
                )
              }
              sessionId={activeSessionId as Id<"studentSessions">}
              completedQuestions={completedQuestions}
            />
          </div>

          {/* Draggable Divider (desktop only) */}
          <div
            onMouseDown={handleMouseDown}
            className="hidden md:block w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors shrink-0 relative group"
          >
            <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-primary/10" />
          </div>

          {/* Bottom Panel (mobile) / Right Panel (desktop) - Chat */}
          <div
            className="overflow-hidden bg-background flex-shrink-0 flex w-full"
            style={chatPanelStyle}
          >
            <ChatPanel
              sessionId={activeSessionId}
              questionId={currentQuestion?._id}
              question={currentQuestion}
              questions={questions ?? []}
            />
          </div>
        </main>
      </div>

      {showCelebration && (
        <CompletionCelebration
          totalQuestions={totalQuestions}
          onClose={() => setShowCelebration(false)}
        />
      )}

      {/* Identity confirmation before entering student view */}
      {!isTeacherView && activeSessionId && (
        <AlertDialog
          open={showIdentityConfirm}
          onOpenChange={setShowIdentityConfirm}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Is this you?</AlertDialogTitle>
              <AlertDialogDescription>
                You&apos;re about to continue as{" "}
                <span className="font-semibold">
                  {sessionData?.session?.name || "this student"}
                </span>
                . If that&apos;s not correct, go back and pick the right name.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setShowIdentityConfirm(false);
                  handleSwitchStudent();
                }}
              >
                Not me
              </AlertDialogCancel>
              <AlertDialogAction onClick={() => setShowIdentityConfirm(false)}>
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
