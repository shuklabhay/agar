"use node";

import { GoogleGenAI, Part, Schema, Type } from "@google/genai";

const MODELS = {
  extraction: "gemini-2.5-flash-lite",
  answerGeneration: "gemini-2.5-flash",
} as const;

const QUESTION_TYPES = [
  "multiple_choice",
  "single_value",
  "short_answer",
  "free_response",
  "skipped",
] as const;

const EXTRACTION_RESPONSE_SCHEMA: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      questionNumber: { type: Type.INTEGER },
      questionText: { type: Type.STRING },
      questionType: {
        type: Type.STRING,
        enum: QUESTION_TYPES as unknown as string[],
      },
      answerOptionsMCQ: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
      additionalInstructionsForAnswer: { type: Type.STRING },
      additionalInstructionsForWork: { type: Type.STRING },
    },
    required: ["questionNumber", "questionText", "questionType"],
  },
};

const ANSWER_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    answer: {
      anyOf: [
        { type: Type.STRING },
        { type: Type.ARRAY, items: { type: Type.STRING } },
      ],
    },
    key_points: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    source: {
      anyOf: [
        { type: Type.STRING },
        { type: Type.ARRAY, items: { type: Type.STRING } },
      ],
    },
  },
  required: ["answer", "key_points", "source"],
};

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

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function withRetry<T>(
  fn: () => Promise<T>,
  context: string,
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES) {
        console.warn(`${context} failed (attempt ${attempt}/${MAX_RETRIES}): ${lastError.message}. Retrying...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
      }
    }
  }
  throw new Error(`${context} failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

function cleanJsonResponse(text: string): string {
  let cleaned = text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  // Find the first JSON structure (array or object)
  const arrayIdx = cleaned.indexOf("[");
  const objIdx = cleaned.indexOf("{");

  // Determine which comes first (ignoring -1 values)
  let startIdx = -1;
  let startChar = "{";
  let endChar = "}";

  if (arrayIdx !== -1 && (objIdx === -1 || arrayIdx < objIdx)) {
    startIdx = arrayIdx;
    startChar = "[";
    endChar = "]";
  } else if (objIdx !== -1) {
    startIdx = objIdx;
    startChar = "{";
    endChar = "}";
  }

  if (startIdx !== -1) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = startIdx; i < cleaned.length; i++) {
      const char = cleaned[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === "{" || char === "[") {
        depth++;
      } else if (char === "}" || char === "]") {
        depth--;
        if (depth === 0) {
          cleaned = cleaned.substring(startIdx, i + 1);
          break;
        }
      }
    }
  }

  // Handle common JSON issues
  cleaned = cleaned
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]");

  return cleaned;
}

function parseJsonWithCleaning<T>(text: string, context: string): T {
  const cleaned = cleanJsonResponse(text);
  try {
    return JSON.parse(cleaned) as T;
  } catch (error) {
    console.warn(`${context} JSON parse failed after cleaning:`, error);
    throw error;
  }
}

const EXTRACTION_PROMPT = `Extract ALL questions from this assignment document.

OUTPUT FIELDS:
- questionNumber: as shown in document
- questionText: FULL question with instruction (e.g., "Solve for x: 3x + 5 = 20", not just "3x + 5 = 20"). If no instruction given, add one (Solve/Simplify/Factor/etc). If it references a passage/figure, include that reference.
- Preserve visible formatting cues that matter to the student (blanks like "____", placeholders like "[ ]", line breaks in passage references). If a blank appears in the prompt, keep it in questionText.
- questionType: "multiple_choice" | "single_value" | "short_answer" | "free_response" | "skipped"
- answerOptionsMCQ: array of choices (MCQ only)
- additionalInstructionsForAnswer: answer format requirements (e.g., "must be decimal")
- additionalInstructionsForWork: method requirements (e.g., "use quadratic formula")

TEACHER'S ADDITIONAL INFO (OVERRIDES DEFAULTS - do what it says):
{additionalInfo}

When teacher provides additional info:
- Question modifications → apply directly to questionText
- MCQ option changes → modify answerOptionsMCQ, but NEVER replace the correct answer. Identify which option is correct first, then replace a wrong one.
- Answer format requirements → put in additionalInstructionsForAnswer
- Method requirements → put in additionalInstructionsForWork
- "skip question X" → set questionType to "skipped"

Preserve math expressions exactly. Respond with ONLY valid JSON array:
[{"questionNumber": 1, "questionText": "...", "questionType": "...", ...}, ...]`;

// Import and re-export from shared types
import type { ExtractedQuestion, GeneratedAnswer } from "../lib/types";
export type { ExtractedQuestion, GeneratedAnswer };

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

  return withRetry(async () => {
    const response = await client.models.generateContent({
      model: MODELS.extraction,
      contents: [{ role: "user", parts: [{ text: prompt }, ...fileParts] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: EXTRACTION_RESPONSE_SCHEMA,
      },
    });

    const responseText = response.text ?? "";
    return parseJsonWithCleaning<ExtractedQuestion[]>(
      responseText,
      "Question extraction",
    );
  }, "Question extraction");
}

const ANSWER_PROMPT = `QUESTION #{questionNumber}: {questionText}
TYPE: {questionType}
{mcqOptionsSection}
FORMAT: {additionalInstructionsForAnswer}
METHOD: {additionalInstructionsForWork}

Answer using the notes provided. If the notes do NOT contain the concept/facts or method you need, use Google Search to pull the relevant facts/concepts, then solve the question. When you use search, include the URLs in source.

ANSWER FORMAT:
- short_answer: expression (e.g., "3x + 27")
- single_value: single value (number, word, or phrase as required)
- multiple_choice: ONE letter only (A/B/C/D)
- free_response: array of key points

KEY_POINTS: 1-2 brief facts (<15 words each) that directly support YOUR answer to THIS question. Cite notes; if you used web search, cite the specific facts from the found pages.

SOURCE: "notes" or array of search URLs used.

Respond with ONLY this JSON:
{"answer": "...", "key_points": ["..."], "source": "notes"}`;

// GeneratedAnswer type is imported from lib/types

export async function generateAnswerForQuestion(
  questionNumber: number,
  questionText: string,
  questionType: string,
  additionalInstructionsForAnswer: string | undefined,
  additionalInstructionsForWork: string | undefined,
  notesParts: Part[],
  client: GoogleGenAI,
  answerOptionsMCQ?: string[],
): Promise<GeneratedAnswer> {
  // Build MCQ options section if this is a multiple choice question
  let mcqOptionsSection = "";
  if (
    questionType === "multiple_choice" &&
    answerOptionsMCQ &&
    answerOptionsMCQ.length > 0
  ) {
    mcqOptionsSection =
      "ANSWER OPTIONS (choose ONE letter):\n" +
      answerOptionsMCQ
        .map((option, i) => `${String.fromCharCode(65 + i)}. ${option}`)
        .join("\n");
  }

  const prompt = ANSWER_PROMPT.replace(
    "{questionNumber}",
    String(questionNumber),
  )
    .replace("{questionText}", questionText)
    .replace("{questionType}", questionType)
    .replace("{mcqOptionsSection}", mcqOptionsSection)
    .replace(
      "{additionalInstructionsForAnswer}",
      additionalInstructionsForAnswer || "None",
    )
    .replace(
      "{additionalInstructionsForWork}",
      additionalInstructionsForWork || "None",
    );

  try {
    return await withRetry(async () => {
      const response = await client.models.generateContent({
        model: MODELS.answerGeneration,
        contents: [{ role: "user", parts: [{ text: prompt }, ...notesParts] }],
        config: {
          tools: [{ googleSearch: {} }],
          responseSchema: ANSWER_RESPONSE_SCHEMA,
        },
      });

      const responseText = response.text ?? "";
      const parsed = parseJsonWithCleaning<{
        answer?: string | string[];
        key_points?: string[];
        keyPoints?: string[];
        source?: string | string[];
      }>(responseText, `Answer for Q${questionNumber}`);
      return {
        answer: parsed.answer ?? "",
        keyPoints: parsed.key_points || parsed.keyPoints || [],
        source: parsed.source ?? "notes",
      } as GeneratedAnswer;
    }, `Answer generation for Q${questionNumber}`);
  } catch (error) {
    console.warn(`Q${questionNumber} failed after retries, using fallback extraction`);
    return extractAnswerFromText("", questionType);
  }
}

// Fallback function to extract answer from non-JSON text
function extractAnswerFromText(
  text: string,
  questionType: string,
): GeneratedAnswer {
  const trimmed = text.trim();
  const answer =
    questionType === "free_response"
      ? (trimmed ? trimmed.split(/\n+/).slice(0, 5) : [])
      : trimmed || "";

  console.warn(
    `Fallback extraction for ${questionType}: "${typeof answer === "string" ? answer.substring(0, 50) : answer[0]?.substring(0, 50)}..."`,
  );

  const keyPoints = ["Answer requires manual review"];

  return {
    answer,
    keyPoints,
    source: "notes",
  };
}

// Batch process questions with shared notes context
export async function generateAnswersForQuestions(
  questions: Array<{
    questionNumber: number;
    questionText: string;
    questionType: string;
    additionalInstructionsForAnswer?: string;
    additionalInstructionsForWork?: string;
    answerOptionsMCQ?: string[];
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
        q.additionalInstructionsForAnswer,
        q.additionalInstructionsForWork,
        notesParts,
        client,
        q.answerOptionsMCQ,
      );
      results.set(q.questionNumber, answer);
    } catch (error) {
      console.error(`Error generating answer for Q${q.questionNumber}:`, error);
      // Set a fallback - will need manual review
      results.set(q.questionNumber, {
        answer: "",
        keyPoints: [],
        source: "notes",
      });
    }
  }

  return results;
}
