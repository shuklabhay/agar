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
The teacher may refer to questions by number, section, module, or description. Match flexibly (e.g., "question 6 in english" or "module 1 question 6" both refer to question 6).

- QUESTION MODIFICATIONS (apply directly to questionText):
  - "reword question X to be harder" → modify the questionText to be harder
  - "question X has an error, change Y to Z" → fix the number/text in questionText
  - "make question X more challenging" → rewrite questionText

- MCQ ANSWER OPTION MODIFICATIONS (modify answerOptionsMCQ array directly!):
  - "replace option B with something about fortnite" → CHANGE the actual text of option B in answerOptionsMCQ to something fortnite-related
  - "change option A to say XYZ" → REPLACE option A text in answerOptionsMCQ with "XYZ"
  - "make option C about basketball" → REPLACE option C text with something basketball-related
  - IMPORTANT: When told to replace/change an MCQ option, you MUST modify the answerOptionsMCQ array itself, not just store instructions!

- ANSWER FORMAT REQUIREMENTS (put in additionalInstructionsForAnswer):
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

const ANSWER_PROMPT = `
QUESTION #{questionNumber}: {questionText}
QUESTION TYPE: {questionType}
{mcqOptionsSection}
ANSWER FORMAT INSTRUCTIONS: {additionalInstructionsForAnswer}
REQUIRED METHOD/APPROACH: {additionalInstructionsForWork}

TASK: Answer THIS SPECIFIC QUESTION using the notes provided. Use Google Search if notes don't cover the topic.

ANSWER FORMAT by question type:
- "short_answer": simplified expression (e.g., "3x + 27")
- "single_number": just the number (e.g., "42" or "3.14")
- "multiple_choice": EXACTLY one letter: A, B, C, or D (nothing else!)
- "free_response": array of key points as strings

KEY_POINTS RULES (CRITICAL - must be relevant to THIS question):
- If answered from NOTES: Extract 1-2 brief quotes/facts from the notes that directly support your answer to THIS question
- If answered from WEB SEARCH: Provide 1-2 brief explanations of WHY your answer is correct (e.g., "The word 'trace' means 'evidence' in this context because...")
- Key points must be SPECIFIC to the question asked - NOT random facts from notes
- Each key point should be under 15 words
- For vocabulary questions: explain the meaning in context
- For reading comprehension: cite the relevant text evidence
- For math: show the key formula or step used

SOURCE: "notes" if answered from notes, or array of search result URLs if web search was used.

CRITICAL: Your response must be ONLY this JSON object, no other text:
{"answer": "<your answer>", "key_points": ["relevant point about THIS question"], "source": "notes"}`;

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

  const maxRetries = 3;
  let lastResponse = "";

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await client.models.generateContent({
      model: MODELS.answerGeneration,
      contents: [{ role: "user", parts: [{ text: prompt }, ...notesParts] }],
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text ?? "";
    lastResponse = responseText;
    const cleaned = cleanJsonResponse(responseText);

    try {
      const parsed = JSON.parse(cleaned);
      return {
        answer: parsed.answer ?? "",
        keyPoints: parsed.key_points || parsed.keyPoints || [],
        source: parsed.source ?? "notes",
      } as GeneratedAnswer;
    } catch {
      if (attempt === maxRetries) {
        console.warn(
          `JSON parse failed for Q${questionNumber} after ${maxRetries} attempts. Attempting fallback extraction...`,
        );
        // Fallback: try to extract answer from plain text response
        return extractAnswerFromText(
          responseText,
          questionType,
          answerOptionsMCQ,
        );
      }
      console.warn(
        `JSON parse failed for Q${questionNumber} (attempt ${attempt}/${maxRetries}), retrying...`,
      );
    }
  }

  // Should not reach here, but provide fallback
  return extractAnswerFromText(lastResponse, questionType, answerOptionsMCQ);
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
