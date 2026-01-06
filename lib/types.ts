// Generic Id type that matches Convex's Id structure
// This avoids importing from generated files which may not exist during convex deploy
type Id<TableName extends string> = string & { __tableName: TableName };

export type QuestionType =
  | "multiple_choice"
  | "single_value"
  | "short_answer"
  | "free_response"
  | "skipped";

export type QuestionStatus = "pending" | "processing" | "ready" | "approved";

export type ProgressStatus =
  | "not_started"
  | "in_progress"
  | "correct"
  | "incorrect";

export type AnswerSource = "notes" | string[];

export interface ExtractedQuestion {
  questionNumber: string;
  questionText: string;
  questionType: string;
  answerOptionsMCQ?: string[];
  additionalInstructionsForAnswer?: string;
  additionalInstructionsForWork?: string;
}

export interface GeneratedAnswer {
  answer: string | string[];
  keyPoints: string[];
  source: AnswerSource;
}

export interface StudentQuestion {
  _id: string;
  questionNumber: string;
  extractionOrder: number;
  questionText: string;
  questionType: QuestionType;
  answerOptionsMCQ?: string[];
}

export interface Question extends StudentQuestion {
  assignmentId: string;
  additionalInstructionsForAnswer?: string;
  additionalInstructionsForWork?: string;
  answer?: string | string[];
  keyPoints?: string[];
  source?: AnswerSource;
  status: QuestionStatus;
}

export interface TutorQuestion {
  questionText: string;
  questionType: string;
  answerOptionsMCQ?: string[];
  answer?: string | string[];
  keyPoints?: string[];
  additionalInstructionsForWork?: string;
  questionNumber?: string;
}

export type UploadedFile = {
  id: string;
  storageId: Id<"_storage">;
  fileName: string;
  contentType: string;
  size: number;
  previewUrl: string;
};

export type UploadingFile = {
  id: string;
  fileName: string;
  progress: number;
  status: "uploading" | "validating" | "error";
  error?: string;
};

export type FileCategory = "assignment" | "notes";

export interface AnalyticsAssignment {
  _id: Id<"assignments">;
  name: string;
  isDraft?: boolean;
}

export interface BoxPlotData {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean?: number;
}

export interface BoxPlotItem {
  name: string;
  boxPlot: BoxPlotData | null;
}

export type BoxPlotElementType =
  | "min"
  | "q1"
  | "median"
  | "q3"
  | "max"
  | "mean"
  | "lowerOutlier"
  | "upperOutlier";

export type BoxPlotHoveredElement = {
  index: number;
  type: BoxPlotElementType;
} | null;

export interface StudentRecord {
  sessionId: string;
  name: string;
  startedAt: number;
  lastActiveAt: number;
  questionsCompleted: number;
  totalQuestions: number;
  completionRate: number;
  totalMessages: number;
  avgMessages: number;
  totalTimeMs: number;
  understandingLevel: "low" | "medium" | "high";
}

export type StudentTableSortField =
  | "name"
  | "completionRate"
  | "avgMessages"
  | "totalTimeMs"
  | "lastActiveAt";

export type SortDirection = "asc" | "desc";

export interface QuestionStats {
  questionId: string;
  questionNumber: string;
  questionText: string;
  questionType: string;
  successRate: number;
  avgMessages: number;
  medianMessages: number;
  avgTimeMs: number;
  studentsAttempted: number;
  struggleScore: number;
}

export type QuestionSortField =
  | "questionNumber"
  | "successRate"
  | "avgMessages"
  | "avgTimeMs"
  | "struggleScore";

export type QuestionSortDirection = "asc" | "desc";

export interface AssignmentPerformance {
  assignmentId: string;
  assignmentName: string;
  sessionId: string;
  questionsCompleted: number;
  totalQuestions: number;
  completionRate: number;
  avgMessages: number;
  totalTimeMs: number;
  lastActiveAt: number;
}

export interface StudentData {
  name: string;
  assignments: AssignmentPerformance[];
  totalQuestionsCompleted: number;
  totalQuestions: number;
  overallCompletionRate: number;
  overallAvgMessages: number;
  lastActiveAt: number;
}

export interface LearnQuestion {
  _id: Id<"questions">;
  questionNumber: string;
  questionText: string;
  questionType: QuestionType;
  answerOptionsMCQ?: string[];
}

export interface StudentProgress {
  _id: Id<"studentProgress">;
  status: ProgressStatus;
  advanceOnCorrect?: boolean;
  selectedAnswer?: string;
  submittedText?: string;
  attempts: number;
}

export interface ChatQuestion {
  _id: Id<"questions">;
  questionNumber: string;
  questionText: string;
  questionType: string;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export type RioMood = "idle" | "happy" | "thinking" | "correct" | "incorrect";

export interface ExistingStudent {
  _id: Id<"studentSessions">;
  name: string;
  lastActiveAt: number;
}

export interface ReviewQuestion {
  _id: Id<"questions">;
  questionNumber: string;
  extractionOrder: number;
  questionText: string;
  questionType: string;
  answerOptionsMCQ?: string[];
  answer?: string | string[];
  keyPoints?: string[];
  source?: "notes" | string[];
  status: QuestionStatus;
}

export interface EditableQuestion {
  _id: Id<"questions">;
  questionNumber: string;
  questionText: string;
  questionType: string;
  answer?: string | string[];
  keyPoints?: string[];
}

export type AuthMode = "login" | "signup";

export interface UseResizablePanelOptions {
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
}

export interface TutorInput {
  question: TutorQuestion;
  history: Array<{ role: string; content: string }>;
  studentMessage: string;
  files?: Array<{ name: string; type: string; data: string }>;
  isFirstMessageForQuestion: boolean;
}

export interface TutorResponse {
  message: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
}
