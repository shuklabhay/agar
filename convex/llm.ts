"use node";

import { GoogleGenAI, Part } from "@google/genai";

const MODELS = {
  extraction: "gemini-2.0-flash-lite",
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

function cleanJsonResponse(text: string): string {
  return text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
}

const EXTRACTION_PROMPT = `Extract ALL questions from this assignment document.

For each question, provide:
1. questionNumber: The question number as shown in the document
2. questionText: The question text - APPLY any corrections/rewording from ADDITIONAL INFO directly here
3. questionType: One of "multiple_choice", "single_number", "short_answer", "free_response", "skipped"
4. answerOptionsMCQ: Array of choices if multiple choice, otherwise omit
5. additionalInstructionsForAnswering: ONLY include instructions about how to GRADE/ACCEPT answers
   (e.g., "only accept Bernoulli's equation", "accept equivalent forms")
   Do NOT put question modifications here - apply those to questionText instead

HANDLING ADDITIONAL INFO FROM TEACHER:
- QUESTION MODIFICATIONS (apply directly to questionText):
  - "reword question X to be harder" → modify the questionText to be harder
  - "question X has an error, change Y to Z" → fix the number/text in questionText
  - "make question X more challenging" → rewrite questionText

- ANSWER INSTRUCTIONS (put in additionalInstructionsForAnswering):
  - "only accept Bernoulli's equation for #5" → store in that question's additionalInstructionsForAnswering
  - "accept simplified form only" → store in additionalInstructionsForAnswering
  - "partial credit for showing work" → store in additionalInstructionsForAnswering

- SKIP INSTRUCTIONS:
  - "skip question X" → set questionType to "skipped"

IMPORTANT:
- For math expressions, preserve them exactly as written (e.g., "3(x + 9) =")
- Mark as "short_answer" for simplification problems where the answer is an expression

ADDITIONAL INFO FROM TEACHER:
{additionalInfo}

Respond with ONLY valid JSON array, no markdown:
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

  const response = await client.models.generateContent({
    model: MODELS.extraction,
    contents: [{ role: "user", parts: [{ text: prompt }, ...fileParts] }],
  });

  const responseText = response.text ?? "";
  const cleaned = cleanJsonResponse(responseText);

  return JSON.parse(cleaned) as ExtractedQuestion[];
}

const ANSWER_PROMPT = `QUESTION #{questionNumber}: {questionText}
QUESTION TYPE: {questionType}
TEACHER SPECIAL INSTRUCTIONS: {additionalInstructions}

TASK: Answer the question using the notes. Use Google Search if notes don't cover the topic.

ANSWER FORMAT by type:
- "short_answer": simplified expression (e.g., "3x + 27")
- "single_number": just the number
- "multiple_choice": the letter choice
- "free_response": array of key points

KEY_POINTS: Extract 1-2 very brief key points (under 15 words each) from notes showing the relevant rule or concept.

SOURCE: Set to "notes" if answered from notes, or array of URLs if web search was used.

Respond with ONLY valid JSON (no markdown):
{
  "answer": "answer here",
  "key_points": ["brief key point"],
  "source": "notes" OR ["https://source.com"]
}`;

// GeneratedAnswer type is imported from lib/types

export async function generateAnswerForQuestion(
  questionNumber: number,
  questionText: string,
  questionType: string,
  additionalInstructions: string | undefined,
  notesParts: Part[],
  client: GoogleGenAI,
): Promise<GeneratedAnswer> {
  const prompt = ANSWER_PROMPT.replace(
    "{questionNumber}",
    String(questionNumber),
  )
    .replace("{questionText}", questionText)
    .replace("{questionType}", questionType)
    .replace("{additionalInstructions}", additionalInstructions || "None");

  const response = await client.models.generateContent({
    model: MODELS.answerGeneration,
    contents: [{ role: "user", parts: [{ text: prompt }, ...notesParts] }],
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const responseText = response.text ?? "";
  const cleaned = cleanJsonResponse(responseText);

  const parsed = JSON.parse(cleaned);
  // Transform snake_case from LLM to camelCase
  return {
    answer: parsed.answer,
    keyPoints: parsed.key_points || [],
    source: parsed.source,
  } as GeneratedAnswer;
}

// Batch process questions with shared notes context
export async function generateAnswersForQuestions(
  questions: Array<{
    questionNumber: number;
    questionText: string;
    questionType: string;
    additionalInstructionsForAnswering?: string;
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
        q.additionalInstructionsForAnswering,
        notesParts,
        client,
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
