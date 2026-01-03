"use client";

import { useState, useEffect } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Question {
  _id: Id<"questions">;
  questionNumber: number;
  questionText: string;
  questionType: "multiple_choice" | "single_number" | "short_answer" | "free_response" | "skipped";
  options?: string[];
}

interface Progress {
  _id: Id<"studentProgress">;
  status: "not_started" | "in_progress" | "correct" | "incorrect";
  selectedAnswer?: string;
  submittedText?: string;
  attempts: number;
}

interface QuestionPanelProps {
  question: Question | undefined;
  progress: Progress | undefined;
  questionIndex: number;
  totalQuestions: number;
  onPrevious: () => void;
  onNext: () => void;
  sessionId: Id<"studentSessions">;
}

export function QuestionPanel({
  question,
  progress,
  questionIndex,
  totalQuestions,
  onPrevious,
  onNext,
  sessionId,
}: QuestionPanelProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingAnswer, setIsCheckingAnswer] = useState(false);

  const submitAnswer = useMutation(api.studentProgress.submitDirectAnswer);
  const initProgress = useMutation(api.studentProgress.initializeProgress);
  const markInProgress = useMutation(api.studentProgress.markInProgress);
  const sendMessageToTutor = useAction(api.chat.sendMessageToTutor);

  // Initialize progress when viewing question
  useEffect(() => {
    if (sessionId && question) {
      initProgress({ sessionId, questionId: question._id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, question?._id, initProgress]);

  // Sync selected option with progress
  useEffect(() => {
    if (progress?.selectedAnswer) {
      setSelectedOption(progress.selectedAnswer);
    } else {
      setSelectedOption(null);
    }
    if (progress?.submittedText) {
      setTextAnswer(progress.submittedText);
    } else {
      setTextAnswer("");
    }
  }, [progress?.selectedAnswer, progress?.submittedText, question?._id]);

  // Mark as in progress when user starts interacting
  const handleInteraction = () => {
    if (sessionId && question && progress?.status === "not_started") {
      markInProgress({ sessionId, questionId: question._id });
    }
  };

  const handleSubmit = async () => {
    if (!sessionId || !question) return;

    const answer =
      question.questionType === "multiple_choice"
        ? selectedOption
        : textAnswer;

    if (!answer) return;

    setIsSubmitting(true);
    try {
      await submitAnswer({
        sessionId,
        questionId: question._id,
        answer,
      });
    } catch (error) {
      console.error("Failed to submit answer:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckAnswer = async () => {
    if (!sessionId || !question || !textAnswer.trim()) return;

    setIsCheckingAnswer(true);
    try {
      await sendMessageToTutor({
        sessionId,
        questionId: question._id,
        message: `Here's my answer to the question:\n\n${textAnswer}\n\nPlease check if this is correct and give me feedback.`,
      });
    } catch (error) {
      console.error("Failed to check answer:", error);
    } finally {
      setIsCheckingAnswer(false);
    }
  };

  if (!question) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading question...</span>
          </div>
        </div>
        <div className="p-4 bg-background flex items-center justify-between">
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled>
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  const isCorrect = progress?.status === "correct";
  const isIncorrect = progress?.status === "incorrect";
  const canSubmitDirectly =
    question.questionType === "multiple_choice" ||
    question.questionType === "single_number";

  return (
    <div className="h-full flex flex-col">
      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto p-6 pb-2 flex flex-col">
        {/* Question header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground font-medium">
            Question {questionIndex + 1} of {totalQuestions}
          </span>
          {isCorrect && (
            <Badge className="bg-green-500 text-white">
              <Check className="h-3 w-3 mr-1" /> Correct
            </Badge>
          )}
          {isIncorrect && (
            <Badge variant="destructive">
              <X className="h-3 w-3 mr-1" /> Try Again
            </Badge>
          )}
        </div>

        {/* Question text */}
        <p className="text-lg leading-relaxed whitespace-pre-wrap mb-6">
          {question.questionText}
        </p>

        {/* Answer Input */}
        <div className="space-y-3 flex-1 flex flex-col">
          {/* MCQ Options */}
          {question.questionType === "multiple_choice" && question.options && (
            <div className="space-y-2">
              {question.options.map((option, i) => {
                const letter = String.fromCharCode(65 + i);
                const isSelected = selectedOption === letter;
                return (
                  <Button
                    key={i}
                    variant={isSelected ? "default" : "outline"}
                    className={cn(
                      "w-full justify-start text-left h-auto py-3 px-4",
                      isCorrect && isSelected && "bg-green-500 hover:bg-green-500",
                      isIncorrect && isSelected && "bg-red-100 border-red-300 dark:bg-red-900/30"
                    )}
                    onClick={() => {
                      handleInteraction();
                      setSelectedOption(letter);
                    }}
                    disabled={isCorrect}
                  >
                    <span className="font-semibold mr-3 shrink-0">{letter}.</span>
                    <span className="text-left">{option}</span>
                  </Button>
                );
              })}
            </div>
          )}

          {/* Number Input */}
          {question.questionType === "single_number" && (
            <Input
              type="text"
              placeholder="Enter your numerical answer..."
              value={textAnswer}
              onChange={(e) => {
                handleInteraction();
                setTextAnswer(e.target.value);
              }}
              disabled={isCorrect}
              className="text-lg"
            />
          )}

          {/* Short Answer / FRQ */}
          {(question.questionType === "short_answer" ||
            question.questionType === "free_response") && (
            <>
              <Textarea
                placeholder="Type your answer here..."
                value={textAnswer}
                onChange={(e) => {
                  handleInteraction();
                  setTextAnswer(e.target.value);
                }}
                disabled={isCorrect}
                className={cn(
                  "min-h-[200px] resize-none",
                  !isCorrect && "flex-1"
                )}
              />
              <Button
                onClick={handleCheckAnswer}
                disabled={isCorrect || !textAnswer.trim() || isCheckingAnswer}
                className={cn(
                  "w-full mt-2",
                  isCorrect && "invisible"
                )}
                size="lg"
              >
                {isCheckingAnswer ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Checking...
                  </>
                ) : (
                  "Submit Answer"
                )}
              </Button>
            </>
          )}
        </div>

        {/* Submit Button (only for MCQ/number) */}
        {canSubmitDirectly && (
          <Button
            onClick={handleSubmit}
            disabled={
              isCorrect ||
              isSubmitting ||
              (question.questionType === "multiple_choice"
                ? !selectedOption
                : !textAnswer)
            }
            className={cn("w-full mt-2", isCorrect && "invisible")}
            size="lg"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              "Submit Answer"
            )}
          </Button>
        )}

        {/* Success message */}
        {isCorrect && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <p className="text-green-700 dark:text-green-300 text-sm font-medium flex items-center gap-2">
              <Check className="h-4 w-4" />
              Great job! You can move to the next question.
            </p>
          </div>
        )}
      </div>

      {/* Navigation - fixed at bottom */}
      <div className="p-4 bg-background flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrevious}
          disabled={questionIndex === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={questionIndex === totalQuestions - 1}
        >
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
