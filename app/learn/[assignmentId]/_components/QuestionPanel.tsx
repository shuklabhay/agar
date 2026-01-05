"use client";

import { useState, useEffect, useRef } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LearnQuestion, StudentProgress } from "@/lib/types";

interface QuestionPanelProps {
  question: LearnQuestion | undefined;
  progress: StudentProgress | undefined;
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
  const [isCheckingAnswer, setIsCheckingAnswer] = useState(false);
  const [incorrectOptions, setIncorrectOptions] = useState<string[]>([]);

  const initProgress = useMutation(api.studentProgress.initializeProgress);
  const markInProgress = useMutation(api.studentProgress.markInProgress);
  const sendMessageToTutor = useAction(api.chat.sendMessageToTutor);
  const questionId = question?._id;
  const questionType = question?.questionType;

  // Initialize progress when viewing question
  useEffect(() => {
    if (sessionId && question) {
      initProgress({ sessionId, questionId: question._id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, question?._id, initProgress]);

  // Track question changes to avoid clobbering user input on status updates
  const prevQuestionId = useRef<string | null>(null);

  useEffect(() => {
    if (!questionId || !questionType) {
      setSelectedOption(null);
      setTextAnswer("");
      setIncorrectOptions([]);
      prevQuestionId.current = null;
      return;
    }

    const isNewQuestion = prevQuestionId.current !== questionId;
    if (isNewQuestion) {
      prevQuestionId.current = questionId;
      setIncorrectOptions([]);
      if (questionType === "multiple_choice") {
        setSelectedOption(progress?.selectedAnswer ?? null);
        setTextAnswer("");
      } else {
        setSelectedOption(null);
        setTextAnswer(progress?.submittedText ?? "");
      }
    }
  }, [
    questionId,
    questionType,
    progress?.selectedAnswer,
    progress?.submittedText,
  ]);

  // Track incorrect MCQ attempts without clearing user input on in_progress updates
  useEffect(() => {
    if (questionType !== "multiple_choice") return;
    if (progress?.status === "incorrect" && progress.selectedAnswer) {
      const wrong = progress.selectedAnswer;
      setIncorrectOptions((prev) =>
        wrong && !prev.includes(wrong) ? [...prev, wrong] : prev,
      );
      setSelectedOption(null);
    }
    if (progress?.status === "correct" && progress.selectedAnswer) {
      setSelectedOption(progress.selectedAnswer);
    }
  }, [progress?.status, progress?.selectedAnswer, questionType]);

  // Mark as in progress when user starts interacting
  const handleInteraction = () => {
    if (sessionId && question && progress?.status === "not_started") {
      markInProgress({ sessionId, questionId: question._id });
    }
  };

  const handleSubmit = async () => {
    if (!sessionId || !question) return;

    const answer =
      question.questionType === "multiple_choice" ? selectedOption : textAnswer;

    if (!answer) return;

    setIsCheckingAnswer(true);
    try {
      const answerText =
        question.questionType === "multiple_choice"
          ? `I choose option ${answer}.`
          : `Here's my answer to the question:\n\n${answer}`;

      const response = await sendMessageToTutor({
        sessionId,
        questionId: question._id,
        message: `${answerText}\n\nPlease check if this is correct and give me feedback.`,
        selectedOption:
          question.questionType === "multiple_choice"
            ? (selectedOption ?? undefined)
            : undefined,
      });

      // Optimistic handling for MCQ incorrect answers when LLM doesn't return detectedAnswer
      if (
        question.questionType === "multiple_choice" &&
        response?.toolCalls &&
        Array.isArray(response.toolCalls)
      ) {
        const evalCall = response.toolCalls.find(
          (call) => call.name === "evaluate_response",
        );
        if (evalCall) {
          const isCorrect = Boolean(evalCall.args?.isCorrect);
          if (!isCorrect) {
            const detected =
              typeof evalCall.args?.detectedAnswer === "string"
                ? evalCall.args.detectedAnswer
                : selectedOption;
            if (detected) {
              setIncorrectOptions((prev) =>
                prev.includes(detected) ? prev : [...prev, detected],
              );
              setSelectedOption(null);
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to submit answer:", error);
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
  return (
    <div className="h-full flex flex-col">
      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto p-6 pb-2 flex flex-col">
        {/* Question header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground font-medium">
            Question {question.questionNumber} ({questionIndex + 1} of{" "}
            {totalQuestions})
          </span>
          {isCorrect && (
            <Badge className="bg-green-500 text-white">
              <Check className="h-3 w-3 mr-1" /> Correct
            </Badge>
          )}
          {isIncorrect && null}
        </div>

        {/* Question text */}
        <p className="text-base text-md leading-relaxed whitespace-pre-wrap mb-6">
          {question.questionText}
        </p>

        {/* Answer Input */}
        <div className="space-y-3 flex-1 flex flex-col">
          {/* MCQ Options */}
          {question.questionType === "multiple_choice" &&
            question.answerOptionsMCQ && (
              <div className="space-y-2">
                {question.answerOptionsMCQ.map((option, i) => {
                  const letter = String.fromCharCode(65 + i);
                  const isSelected = selectedOption === letter;
                  const isDisabled =
                    incorrectOptions.includes(letter) || isCorrect;
                  return (
                    <Button
                      key={i}
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left h-auto py-3 px-4",
                        isSelected &&
                          "border-primary text-primary bg-primary/10 hover:bg-primary/15",
                        incorrectOptions.includes(letter) &&
                          "border-muted text-muted-foreground bg-muted/30",
                      )}
                      onClick={() => {
                        handleInteraction();
                        setSelectedOption(letter);
                      }}
                      disabled={isDisabled}
                    >
                      <span className="font-semibold mr-3 shrink-0">
                        {letter}.
                      </span>
                      <span className="text-left whitespace-normal break-words">
                        {option}
                      </span>
                    </Button>
                  );
                })}
              </div>
            )}

          {/* Single value input */}
          {question.questionType === "single_value" && (
            <Input
              type="text"
              placeholder="Enter your answer..."
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
                  !isCorrect && "flex-1",
                )}
              />
            </>
          )}
        </div>

        {/* Submit Button (all types go through tutor) */}
        <Button
          onClick={handleSubmit}
          disabled={
            isCorrect ||
            isCheckingAnswer ||
            (question.questionType === "multiple_choice" && !selectedOption) ||
            (question.questionType === "single_value" && !textAnswer.trim()) ||
            (question.questionType !== "multiple_choice" &&
              question.questionType !== "single_value" &&
              !textAnswer.trim())
          }
          className={cn("w-full mt-2", isCorrect && "invisible")}
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
