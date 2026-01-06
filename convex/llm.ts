"use node";

import { GoogleGenAI, Part, Schema, Type } from "@google/genai";

const MODELS = {
  extraction: "gemini-2.5-flash-lite",
  answerGeneration: "models/gemini-3-flash-preview",
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
      questionNumber: { type: Type.STRING },
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

async function withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES) {
        console.warn(
          `${context} failed (attempt ${attempt}/${MAX_RETRIES}): ${lastError.message}. Retrying...`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY_MS * attempt),
        );
      }
    }
  }
  throw new Error(
    `${context} failed after ${MAX_RETRIES} attempts: ${lastError?.message}`,
  );
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

  if (arrayIdx !== -1 && (objIdx === -1 || arrayIdx < objIdx)) {
    startIdx = arrayIdx;
  } else if (objIdx !== -1) {
    startIdx = objIdx;
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
  cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

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

function cleanGroundingUrl(uri: string): string | null {
  try {
    const url = new URL(uri);
    const host = url.hostname.toLowerCase();

    if (host.includes("vertexaisearch.cloud.google")) {
      return null;
    }

    if (host === "www.google.com" && url.pathname === "/url") {
      const target = url.searchParams.get("q");
      if (target) return target;
    }

    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function dedupe<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function normalizeParsedSource(
  source: string | string[] | undefined,
  fallbackUrls: string[],
): string | string[] {
  if (Array.isArray(source)) {
    const cleaned = dedupe(
      source
        .map((s) =>
          typeof s === "string" ? cleanGroundingUrl(s.trim()) : null,
        )
        .filter((s): s is string => Boolean(s)),
    );
    if (cleaned.length > 0) return cleaned;
  } else if (typeof source === "string" && source.trim().length > 0) {
    const trimmed = source.trim();
    const cleaned = cleanGroundingUrl(trimmed);
    if (trimmed.toLowerCase() === "notes") return "notes";
    if (cleaned) return [cleaned];
    return [trimmed];
  }

  if (fallbackUrls.length > 0) return fallbackUrls;
  return "notes";
}

function normalizeAnswerValue(
  answer: unknown,
  questionType: string,
): string | string[] {
  const coerceValue = (val: unknown): string => {
    if (typeof val === "string") return val.trim();
    if (Array.isArray(val)) return val.map(coerceValue).join(", ");
    if (val && typeof val === "object") {
      return Object.entries(val)
        .map(([k, v]) => `${k}: ${coerceValue(v)}`)
        .join("; ");
    }
    if (val === null || val === undefined) return "";
    return String(val);
  };

  if (typeof answer === "string") {
    return answer.trim();
  }

  if (Array.isArray(answer)) {
    return answer.map(coerceValue).filter((s) => s.length > 0);
  }

  if (answer && typeof answer === "object") {
    const entries = Object.entries(answer).map(
      ([k, v]) => `${k}: ${coerceValue(v)}`,
    );
    return questionType === "free_response" ? entries : entries.join("; ");
  }

  return "";
}

const EXTRACTION_PROMPT = `Extract ALL questions from this assignment document.

OUTPUT FIELDS:
- questionNumber: as shown in document (always a string). If numbering includes letters like "16a/16b/16c", treat each lettered part as its own separate question entry (never merge lettered parts together).
- questionText: FULL question with instruction (e.g., "Solve for x: 3x + 5 = 20", not just "3x + 5 = 20"). If no instruction given, add one (Solve/Simplify/Factor/etc). If it references a passage/figure, include that reference.
- Preserve visible formatting cues that matter to the student (blanks like "____", placeholders like "[ ]", line breaks in passage references). If a blank appears in the prompt, keep it in questionText.
- Do NOT preserve hard line breaks inside a single sentence (PDF wrap). If a sentence is split across two lines, merge it into one sentence without the break. If there are clearly separate sentences or bullet lines, keep those breaks.
- questionType: "multiple_choice" | "single_value" | "short_answer" | "free_response" | "skipped"
- answerOptionsMCQ: array of choices (MCQ only)
- additionalInstructionsForAnswer: answer format requirements (e.g., "must be decimal")
- additionalInstructionsForWork: method requirements (e.g., "use quadratic formula")
- NEVER include MCQ option text inside questionText. Keep the stem/instruction in questionText and put every visible option only in answerOptionsMCQ. 

TEACHER'S ADDITIONAL INFO (OVERRIDES DEFAULTS - do what it says):
{additionalInfo}

When teacher provides additional info:
- Question modifications → apply directly to questionText
- MCQ option changes → modify answerOptionsMCQ, but NEVER replace the correct answer. Identify which option is correct first, then replace a wrong one.
- Answer format requirements → put in additionalInstructionsForAnswer
- Method requirements → put in additionalInstructionsForWork
- "skip question X" → set questionType to "skipped"

Preserve math expressions exactly. Do NOT transcribe tables/graphs; instead, note the reference in questionText (e.g., "Refer to the table on page 2" or "See graph above"). Respond with ONLY valid JSON array:
[{"questionNumber": "1", "questionText": "...", "questionType": "...", ...}, ...]`;

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
        responseSchema: EXTRACTION_RESPONSE_SCHEMA,
        responseMimeType: "application/json",
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

Answer using the notes provided. If the notes are missing what you need, use Google Search to fetch supporting facts and ground your answer.
- When you have the final answer, respond ONLY with JSON matching the schema (answer, key_points, source). No prose or markdown.
- For multiple_choice answers, return ONLY the exact option text (no letter prefixes like "B." and no "B. Option" combos). If the option text is missing, return just the single letter.
- For answers: use a single string for multiple_choice/single_value/short_answer; use an array for free_response when needed. Provide 1-2 concise key_points (quoted/paraphrased) from notes or searched pages.
- If you used only notes, set source to \"notes\". If you used search, set source to the real URLs (no placeholders).`;

export async function generateAnswerForQuestion(
  questionNumber: string,
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

  const prompt = ANSWER_PROMPT.replace("{questionNumber}", questionNumber)
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
  const noNotesHint =
    notesParts.length === 0
      ? "\nNO_NOTES_CONTEXT: No notes or source files were provided. Use Google Search to find the needed facts before answering."
      : "";

  try {
    const finalResponse = await withRetry(async () => {
      const response = await client.models.generateContent({
        model: MODELS.answerGeneration,
        contents: [
          {
            role: "user",
            parts: [{ text: prompt + noNotesHint }, ...notesParts],
          },
        ],
        config: {
          tools: [{ googleSearch: {} }],
          responseSchema: ANSWER_RESPONSE_SCHEMA,
          responseMimeType: "application/json",
        },
      });

      const candidate = response.candidates?.[0];
      const groundingUrls: string[] =
        candidate?.groundingMetadata?.groundingChunks
          ?.map((chunk) => chunk.web?.uri)
          .filter((uri): uri is string => Boolean(uri)) || [];
      const cleanedGroundingUrls = dedupe(
        groundingUrls
          .map((uri) => (uri ? cleanGroundingUrl(uri) : null))
          .filter((uri): uri is string => Boolean(uri)),
      );

      const responseText = response.text ?? "";
      const parsed = parseJsonWithCleaning<{
        answer: string | string[];
        key_points: string[];
        source: string | string[];
      }>(responseText, `Answer generation Q${questionNumber}`);

      return { parsed, cleanedGroundingUrls };
    }, `Answer generation for Q${questionNumber}`);

    const normalizedAnswer = normalizeAnswerValue(
      finalResponse.parsed.answer,
      questionType,
    );

    const source = normalizeParsedSource(
      finalResponse.parsed.source,
      finalResponse.cleanedGroundingUrls,
    );

    return {
      answer: normalizedAnswer,
      keyPoints: finalResponse.parsed.key_points || [],
      source: source || "notes",
    } as GeneratedAnswer;
  } catch (error) {
    throw error;
  }
}

export async function generateAnswersForQuestions(
  questions: Array<{
    questionNumber: string;
    questionText: string;
    questionType: string;
    additionalInstructionsForAnswer?: string;
    additionalInstructionsForWork?: string;
    answerOptionsMCQ?: string[];
  }>,
  notesFileUrls: string[],
): Promise<Map<string, GeneratedAnswer>> {
  const client = getClient();

  // Prepare notes files once (reuse across questions)
  const notesParts: Part[] = await Promise.all(
    notesFileUrls.map(async (url) => {
      const { data, mimeType } = await fetchFileAsBase64(url);
      return { inlineData: { data, mimeType } };
    }),
  );

  const results = new Map<string, GeneratedAnswer>();

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
