// Shared types for questions and answers

export type QuestionType =
  | "multiple_choice"
  | "single_number"
  | "short_answer"
  | "free_response"
  | "skipped";

export type QuestionStatus = "pending" | "processing" | "ready" | "approved";

export type ProgressStatus = "not_started" | "in_progress" | "correct" | "incorrect";

export type AnswerSource = "notes" | string[];

// Extracted question from document (LLM output)
export interface ExtractedQuestion {
  questionNumber: number;
  questionText: string;
  questionType: string;
  answerOptionsMCQ?: string[];
  additionalInstructionsForAnswering?: string;
}

// Generated answer from LLM
export interface GeneratedAnswer {
  answer: string | string[];
  keyPoints: string[];
  source: AnswerSource;
}

// Question for student view (without answer)
export interface StudentQuestion {
  _id: string;
  questionNumber: number;
  questionText: string;
  questionType: QuestionType;
  answerOptionsMCQ?: string[];
}

// Full question (teacher view)
export interface Question extends StudentQuestion {
  assignmentId: string;
  additionalInstructionsForAnswering?: string;
  answer?: string | string[];
  keyPoints?: string[];
  source?: AnswerSource;
  status: QuestionStatus;
}

// Tutor LLM input question format
export interface TutorQuestion {
  questionText: string;
  questionType: string;
  answerOptionsMCQ?: string[];
  answer?: string | string[];
  keyPoints?: string[];
}
