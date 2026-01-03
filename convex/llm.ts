"use node";

import { GoogleGenAI, Part } from "@google/genai";

// ============================================================================
// CONFIG
// ============================================================================

const MODELS = {
  extraction: "gemini-2.5-flash-lite",
  answerGeneration: "gemini-2.0-flash",
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

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  return new GoogleGenAI({ apiKey });
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

  const response = await client.models.generateContent({
    model: MODELS.extraction,
    contents: [{ role: "user", parts: [{ text: prompt }, ...fileParts] }],
  });

  const responseText = response.text ?? "";
  const cleaned = cleanJsonResponse(responseText);

  return JSON.parse(cleaned) as ExtractedQuestion[];
}

// ============================================================================
// ANSWER GENERATION (with Google Search Grounding)
// ============================================================================

const ANSWER_PROMPT = `You are generating answers for a tutoring system. You have access to the teacher's notes AND Google Search.

QUESTION #{questionNumber}: {questionText}
QUESTION TYPE: {questionType}
TEACHER SPECIAL INSTRUCTIONS: {teacherInfo}

TASK: Answer the question using the notes. Use Google Search if notes don't cover the topic.

ANSWER FORMAT by type:
- "short_answer": simplified expression (e.g., "3x + 27")
- "single_number": just the number
- "multiple_choice": the letter choice
- "free_response": array of key points

SNIPPETS: Extract 1-2 very brief snippets (under 15 words each) from notes showing the relevant rule or concept.

SOURCE: Set to "notes" if answered from notes, or array of URLs if web search was used.

Respond with ONLY valid JSON (no markdown):
{
  "answer": "answer here",
  "snippets": ["brief snippet"],
  "source": "notes" OR ["https://source.com"]
}`;

export type GeneratedAnswer = {
  answer: string | string[];
  snippets: string[];
  source: "notes" | string[];
};

export async function generateAnswerForQuestion(
  questionNumber: number,
  questionText: string,
  questionType: string,
  teacherInfo: string | undefined,
  notesParts: Part[],
  client: GoogleGenAI,
): Promise<GeneratedAnswer> {
  const prompt = ANSWER_PROMPT.replace("{questionNumber}", String(questionNumber))
    .replace("{questionText}", questionText)
    .replace("{questionType}", questionType)
    .replace("{teacherInfo}", teacherInfo || "None");

  // Enable Google Search grounding for answer generation
  const response = await client.models.generateContent({
    model: MODELS.answerGeneration,
    contents: [{ role: "user", parts: [{ text: prompt }, ...notesParts] }],
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const responseText = response.text ?? "";
  const cleaned = cleanJsonResponse(responseText);

  return JSON.parse(cleaned) as GeneratedAnswer;
}

// Batch process questions with shared notes context
export async function generateAnswersForQuestions(
  questions: Array<{
    questionNumber: number;
    questionText: string;
    questionType: string;
    teacherInfo?: string;
  }>,
  notesFileUrls: string[],
): Promise<Map<number, GeneratedAnswer>> {
  const client = getClient();

  // Prepare notes files once (reuse across questions)
  const notesParts: Part[] = await Promise.all(
    notesFileUrls.map(async (url) => {
      const { data, mimeType } = await fetchFileAsBase64(url);
      return { inlineData: { data, mimeType } };
    }),
  );

  const results = new Map<number, GeneratedAnswer>();

  // Process questions (could parallelize in batches later)
  for (const q of questions) {
    try {
      const answer = await generateAnswerForQuestion(
        q.questionNumber,
        q.questionText,
        q.questionType,
        q.teacherInfo,
        notesParts,
        client,
      );
      results.set(q.questionNumber, answer);
    } catch (error) {
      console.error(`Error generating answer for Q${q.questionNumber}:`, error);
      // Set a fallback - will need manual review
      results.set(q.questionNumber, {
        answer: "",
        snippets: [],
        source: "notes",
      });
    }
  }

  return results;
}
