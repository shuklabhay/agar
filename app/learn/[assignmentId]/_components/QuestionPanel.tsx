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
  questionType: "multiple_choice" | "single_number" | "short_answer" | "free_response";
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
      <div className="p-6 flex items-center justify-center h-full">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading question...</span>
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
    <div className="p-4 space-y-6">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrevious}
          disabled={questionIndex === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
        <span className="text-sm text-muted-foreground font-medium">
          Question {questionIndex + 1} of {totalQuestions}
        </span>
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

      {/* Question */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="shrink-0">
            Q{question.questionNumber}
          </Badge>
          <Badge variant="secondary" className="shrink-0 text-xs">
            {question.questionType.replace("_", " ")}
          </Badge>
          {isCorrect && (
            <Badge className="bg-green-500 text-white ml-auto">
              <Check className="h-3 w-3 mr-1" /> Correct
            </Badge>
          )}
          {isIncorrect && (
            <Badge variant="destructive" className="ml-auto">
              <X className="h-3 w-3 mr-1" /> Try Again
            </Badge>
          )}
        </div>
        <p className="text-base leading-relaxed whitespace-pre-wrap">
          {question.questionText}
        </p>
      </div>

      {/* Answer Input */}
      <div className="space-y-3">
        <h3 className="font-medium text-sm text-muted-foreground">
          Your Answer
        </h3>

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
              rows={question.questionType === "free_response" ? 6 : 3}
            />
            {!isCorrect && (
              <Button
                onClick={handleCheckAnswer}
                disabled={!textAnswer.trim() || isCheckingAnswer}
                className="w-full"
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
            )}
          </>
        )}
      </div>

      {/* Submit Button (only for MCQ/number) */}
      {canSubmitDirectly && !isCorrect && (
        <Button
          onClick={handleSubmit}
          disabled={
            isSubmitting ||
            (question.questionType === "multiple_choice"
              ? !selectedOption
              : !textAnswer)
          }
          className="w-full"
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
  );
}
