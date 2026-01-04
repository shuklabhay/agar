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

function cleanJsonResponse(text: string): string {
  return text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
}

const EXTRACTION_PROMPT = `Extract ALL questions from this assignment document.

For each question, provide:
1. questionNumber: The question number as shown in the document
2. questionText: The COMPLETE question including both the instruction AND the problem. See QUESTION TEXT RULES below.
3. questionType: One of "multiple_choice", "single_number", "short_answer", "free_response", "skipped"
4. answerOptionsMCQ: Array of choices if multiple choice, otherwise omit
5. additionalInstructionsForAnswer: Instructions about the ANSWER itself - corrections to answer choices, what format to accept
   (e.g., "replace option B with 'fortnite'", "accept equivalent forms", "answer must be in fraction form")
6. additionalInstructionsForWork: Instructions about HOW TO SOLVE the problem - required methods or approaches
   (e.g., "must use quadratic formula", "solve using Bernoulli's equation only", "show work using integration by parts")

QUESTION TEXT RULES:
- ALWAYS include the instruction with the problem, not just the equation/expression alone
  - Good: "Solve for x: 3x + 5 = 20"
  - Good: "Simplify the expression: 4(2x + 3) - 2x"
  - Bad: "3x + 5 = 20" (missing instruction)
  - Bad: "4(2x + 3) - 2x" (missing instruction)

- If no instruction is given in the document, ADD a concise one based on question type:
  - For equations → "Solve for x: ..." or "Solve for the variable: ..."
  - For expressions → "Simplify to lowest terms: ..." or "Simplify completely: ..."
  - For fractions → "Reduce to lowest terms: ..."
  - For factoring → "Factor completely: ..."
  - For word problems → keep as-is (instruction is implicit)
  - For calculations → "Calculate the value of: ..." or "Find: ..."
  - For evaluations → "Evaluate when x = ...: ..."

- If question references a PASSAGE, TABLE, GRAPH, or FIGURE:
  - Include a reference like: "(Refer to Passage A above)" or "(See Figure 1)" or "(Use the table on page 2)"
  - If the passage/figure has a name/label, use it: "(Refer to 'The Water Cycle' passage)"
  - If no label, describe location: "(Refer to the graph at the top of the page)"

- Apply any corrections/rewording from ADDITIONAL INFO directly to questionText

HANDLING ADDITIONAL INFO FROM TEACHER:
- QUESTION MODIFICATIONS (apply directly to questionText):
  - "reword question X to be harder" → modify the questionText to be harder
  - "question X has an error, change Y to Z" → fix the number/text in questionText
  - "make question X more challenging" → rewrite questionText

- ANSWER MODIFICATIONS (put in additionalInstructionsForAnswer):
  - "replace option B with something about fortnite" → store in additionalInstructionsForAnswer
  - "accept simplified form only" → store in additionalInstructionsForAnswer
  - "answer must be a decimal, not fraction" → store in additionalInstructionsForAnswer

- METHOD/WORK REQUIREMENTS (put in additionalInstructionsForWork):
  - "only accept if using quadratic formula" → store in additionalInstructionsForWork
  - "must solve using Bernoulli's equation" → store in additionalInstructionsForWork
  - "require showing work with integration" → store in additionalInstructionsForWork

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
ANSWER FORMAT INSTRUCTIONS: {additionalInstructionsForAnswer}
REQUIRED METHOD/APPROACH: {additionalInstructionsForWork}

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
  additionalInstructionsForAnswer: string | undefined,
  additionalInstructionsForWork: string | undefined,
  notesParts: Part[],
  client: GoogleGenAI,
): Promise<GeneratedAnswer> {
  const prompt = ANSWER_PROMPT.replace(
    "{questionNumber}",
    String(questionNumber),
  )
    .replace("{questionText}", questionText)
    .replace("{questionType}", questionType)
    .replace("{additionalInstructionsForAnswer}", additionalInstructionsForAnswer || "None")
    .replace("{additionalInstructionsForWork}", additionalInstructionsForWork || "None");

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
    additionalInstructionsForAnswer?: string;
    additionalInstructionsForWork?: string;
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
