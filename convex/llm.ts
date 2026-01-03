"use node";

import { GoogleGenerativeAI, Part } from "@google/generative-ai";

// ============================================================================
// CONFIG
// ============================================================================

const MODELS = {
  extraction: "gemini-2.5-flash-lite",
  answerGeneration: "gemini-2.0-flash", // for Phase 2
} as const;

// ============================================================================
// HELPERS
// ============================================================================

export async function fetchFileAsBase64(
  url: string,
): Promise<{ data: string; mimeType: string }> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const contentType = response.headers.get("content-type") || "application/pdf";
  return { data: base64, mimeType: contentType };
}

function getClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  return new GoogleGenerativeAI(apiKey);
}

function cleanJsonResponse(text: string): string {
  return text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
}

// ============================================================================
// QUESTION EXTRACTION
// ============================================================================

const EXTRACTION_PROMPT = `You are extracting questions from an assignment document for a tutoring system.

TASK: Extract ALL questions from this assignment document.

For each question, provide:
1. questionNumber: The question number as shown in the document
2. questionText: The exact question text (include any expressions/equations)
3. questionType: One of "multiple_choice", "single_number", "short_answer", "free_response", "skipped"
4. options: Array of choices if multiple choice, otherwise omit
5. teacherInfo: Any special instructions found near the question, otherwise omit

IMPORTANT:
- For math expressions, preserve them exactly as written (e.g., "3(x + 9) =")
- Mark as "short_answer" for simplification problems where the answer is an expression
- If additional info says to skip a question, set questionType to "skipped"

ADDITIONAL INFO FROM TEACHER:
{additionalInfo}

Respond with ONLY valid JSON array, no markdown:
[{"questionNumber": 1, "questionText": "...", "questionType": "...", ...}, ...]`;

export type ExtractedQuestion = {
  questionNumber: number;
  questionText: string;
  questionType: string;
  options?: string[];
  teacherInfo?: string;
};

export async function extractQuestionsFromFiles(
  fileUrls: string[],
  additionalInfo?: string,
): Promise<ExtractedQuestion[]> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: MODELS.extraction });

  // Prepare file parts
  const fileParts: Part[] = await Promise.all(
    fileUrls.map(async (url) => {
      const { data, mimeType } = await fetchFileAsBase64(url);
      return { inlineData: { data, mimeType } };
    }),
  );

  if (fileParts.length === 0) {
    throw new Error("No files to process");
  }

  const prompt = EXTRACTION_PROMPT.replace(
    "{additionalInfo}",
    additionalInfo || "None",
  );

  const result = await model.generateContent([prompt, ...fileParts]);
  const responseText = result.response.text();
  const cleaned = cleanJsonResponse(responseText);

  return JSON.parse(cleaned) as ExtractedQuestion[];
}

// ============================================================================
// ANSWER GENERATION (Phase 2 - stub for now)
// ============================================================================

const ANSWER_PROMPT = `You are generating an answer for a tutoring system.

QUESTION: {questionText}
QUESTION TYPE: {questionType}
TEACHER NOTES: {teacherInfo}

Using the provided notes, determine:
1. The correct answer
2. Relevant snippets from the notes that support/explain the answer

NOTES CONTENT:
{notesContent}

Respond with ONLY valid JSON:
{
  "answer": "the answer (for short_answer: simplified expression, for multiple_choice: the letter)",
  "snippets": ["relevant snippet 1", "relevant snippet 2"],
  "source": "notes"
}`;

export type GeneratedAnswer = {
  answer: string | string[];
  snippets: string[];
  source: "notes" | string[];
};

export async function generateAnswerForQuestion(
  questionText: string,
  questionType: string,
  teacherInfo: string | undefined,
  notesFileUrls: string[],
): Promise<GeneratedAnswer> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: MODELS.answerGeneration });

  // Prepare notes files
  const notesParts: Part[] = await Promise.all(
    notesFileUrls.map(async (url) => {
      const { data, mimeType } = await fetchFileAsBase64(url);
      return { inlineData: { data, mimeType } };
    }),
  );

  const prompt = ANSWER_PROMPT
    .replace("{questionText}", questionText)
    .replace("{questionType}", questionType)
    .replace("{teacherInfo}", teacherInfo || "None")
    .replace("{notesContent}", "[See attached files]");

  const result = await model.generateContent([prompt, ...notesParts]);
  const responseText = result.response.text();
  const cleaned = cleanJsonResponse(responseText);

  return JSON.parse(cleaned) as GeneratedAnswer;
}
