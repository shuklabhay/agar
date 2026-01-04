"use node";

import { GoogleGenAI, Part } from "@google/genai";

const MODELS = {
  extraction: "gemini-2.5-flash-lite",
  answerGeneration: "gemini-2.5-flash",
} as const;

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

  // Try to extract JSON object if it's embedded in other text
  const jsonObjMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonObjMatch) {
    cleaned = jsonObjMatch[0];
  } else {
    // Try to extract JSON array if no object found
    const jsonArrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (jsonArrMatch) {
      cleaned = jsonArrMatch[0];
    }
  }

  // Handle common JSON issues (conservative fixes only)
  cleaned = cleaned
    .replace(/,\s*}/g, "}") // Remove trailing commas before }
    .replace(/,\s*]/g, "]"); // Remove trailing commas before ]

  return cleaned;
}

const EXTRACTION_PROMPT = `Extract ALL questions from this assignment document.

OUTPUT FIELDS:
- questionNumber: as shown in document
- questionText: FULL question with instruction (e.g., "Solve for x: 3x + 5 = 20", not just "3x + 5 = 20"). If no instruction given, add one (Solve/Simplify/Factor/etc). If it references a passage/figure, include that reference.
- questionType: "multiple_choice" | "single_number" | "short_answer" | "free_response" | "skipped"
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
    });

    const responseText = response.text ?? "";
    const cleaned = cleanJsonResponse(responseText);
    return JSON.parse(cleaned) as ExtractedQuestion[];
  }, "Question extraction");
}

const ANSWER_PROMPT = `QUESTION #{questionNumber}: {questionText}
TYPE: {questionType}
{mcqOptionsSection}
FORMAT: {additionalInstructionsForAnswer}
METHOD: {additionalInstructionsForWork}

Answer using the notes provided. Use Google Search if notes don't cover the topic.

ANSWER FORMAT:
- short_answer: expression (e.g., "3x + 27")
- single_number: just the number
- multiple_choice: ONE letter only (A/B/C/D)
- free_response: array of key points

KEY_POINTS: 1-2 brief facts (<15 words each) that directly support YOUR answer to THIS question. Cite notes or explain reasoning.

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
          responseMimeType: "application/json",
        },
      });

      const responseText = response.text ?? "";
      const cleaned = cleanJsonResponse(responseText);
      const parsed = JSON.parse(cleaned);
      return {
        answer: parsed.answer ?? "",
        keyPoints: parsed.key_points || parsed.keyPoints || [],
        source: parsed.source ?? "notes",
      } as GeneratedAnswer;
    }, `Answer generation for Q${questionNumber}`);
  } catch (error) {
    console.warn(`Q${questionNumber} failed after retries, using fallback extraction`);
    return extractAnswerFromText("", questionType, answerOptionsMCQ);
  }
}

// Fallback function to extract answer from non-JSON text
function extractAnswerFromText(
  text: string,
  questionType: string,
  answerOptionsMCQ?: string[],
): GeneratedAnswer {
  let answer: string | string[] = "";

  if (questionType === "multiple_choice") {
    // Look for letter answer (A, B, C, D)
    const letterMatch = text.match(/\b([A-D])\b/);
    if (letterMatch) {
      answer = letterMatch[1];
    } else if (answerOptionsMCQ && answerOptionsMCQ.length > 0) {
      // Try to match option text
      for (let i = 0; i < answerOptionsMCQ.length; i++) {
        if (
          text
            .toLowerCase()
            .includes(answerOptionsMCQ[i].toLowerCase().substring(0, 20))
        ) {
          answer = String.fromCharCode(65 + i);
          break;
        }
      }
    }
  } else if (questionType === "single_number") {
    // Extract number
    const numMatch = text.match(/-?\d+\.?\d*/);
    answer = numMatch ? numMatch[0] : "";
  } else if (questionType === "free_response") {
    // Split into key points
    answer = text
      .split(/\n|\./)
      .filter((s) => s.trim().length > 10)
      .slice(0, 5);
  } else {
    // Short answer - take first sentence or meaningful chunk
    const sentences = text.split(/[.!?]/).filter((s) => s.trim().length > 0);
    answer = sentences[0]?.trim() || text.substring(0, 100);
  }

  console.warn(
    `Fallback extraction for ${questionType}: "${typeof answer === "string" ? answer.substring(0, 50) : answer[0]?.substring(0, 50)}..."`,
  );

  // Try to extract a useful key point from the text
  const keyPoints: string[] = [];
  // Look for explanation patterns
  const explanationMatch = text.match(/because[^.]*\.|means[^.]*\.|refers to[^.]*\.|indicates[^.]*\./i);
  if (explanationMatch) {
    keyPoints.push(explanationMatch[0].trim().substring(0, 80));
  } else {
    // Take a relevant sentence that's not too long
    const sentences = text.split(/[.!?]/).filter(s => s.trim().length > 20 && s.trim().length < 100);
    if (sentences.length > 0) {
      keyPoints.push(sentences[0].trim());
    } else {
      keyPoints.push("Answer extracted automatically - please verify");
    }
  }

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
