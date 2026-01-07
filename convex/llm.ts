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

function normalizeMcqAnswer(answer: unknown, options?: string[]): string {
  const letters = options?.map((_, idx) => String.fromCharCode(65 + idx)) || [];

  const coerceToString = (val: unknown): string => {
    if (typeof val === "string") return val;
    if (Array.isArray(val)) return val.map(coerceToString).join(" ");
    if (val && typeof val === "object") {
      return Object.values(val).map(coerceToString).join(" ");
    }
    return String(val ?? "");
  };

  const raw = coerceToString(answer).trim();
  if (!raw) {
    throw new Error("MCQ answer is empty");
  }

  const leadingLetterMatch = raw.match(/^([A-Za-z])/);
  if (leadingLetterMatch) {
    const letter = leadingLetterMatch[1].toUpperCase();
    if (letters.length === 0 || letters.includes(letter)) return letter;
  }

  const strippedOptionText = raw.replace(/^[A-Za-z][).:\-\s]+/, "").trim();

  if (options && options.length > 0) {
    const lowerOptions = options.map((opt) => opt.trim().toLowerCase());
    const lowerStripped = strippedOptionText.toLowerCase();
    const exactIdx = lowerOptions.findIndex((opt) => opt === lowerStripped);
    if (exactIdx !== -1) return letters[exactIdx];

    const containsIdx = lowerOptions.findIndex((opt) =>
      lowerStripped.includes(opt),
    );
    if (containsIdx !== -1) return letters[containsIdx];
  }

  if (letters.length > 0) {
    const boundaryRegex = new RegExp(`\\b([${letters.join("")}])\\b`, "i");
    const boundaryMatch = raw.match(boundaryRegex);
    if (boundaryMatch) return boundaryMatch[1].toUpperCase();
  }

  throw new Error("MCQ answer could not be normalized to a letter");
}

function normalizeAnswerValue(
  answer: unknown,
  questionType: string,
  answerOptionsMCQ?: string[],
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

  if (questionType === "multiple_choice") {
    return normalizeMcqAnswer(answer, answerOptionsMCQ);
  }

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

const EXTRACTION_PROMPT = `<prompt>
<core_task>
- Extract ALL questions from this assignment document.
</core_task>

<formatting_rules>
- Preserve visible formatting cues that matter to the student (blanks like "____", placeholders like "[ ]", line breaks in passage references). If a blank appears in the prompt, keep it in questionText.
- Do NOT preserve hard line breaks inside a single sentence (PDF wrap). If a sentence is split across two lines, merge it into one sentence without the break. If there are clearly separate sentences or bullet lines, keep those breaks.
- NEVER include MCQ option text inside questionText. Keep the stem/instruction in questionText and put every visible option only in answerOptionsMCQ.
</formatting_rules>

<teacher_additional_info>
- {additionalInfo}
</teacher_additional_info>

<teacher_rules>
- Question modifications → apply directly to questionText.
- MCQ option changes → modify answerOptionsMCQ, but NEVER replace the correct answer. Identify which option is correct first, then replace a wrong one.
- Answer format requirements → put in additionalInstructionsForAnswer.
- Method requirements → put in additionalInstructionsForWork.
- "skip question X" → set questionType to "skipped".
</teacher_rules>

<math_and_references>
- Preserve math expressions exactly.
- Do NOT transcribe tables/graphs; instead, note the reference in questionText (e.g., "Refer to the table on page 2" or "See graph above").
- For tables or graphic organizers with blanks/prompts, treat each blank/prompt as its own short_answer question. Include the row/column/section label in questionText (e.g., "Table: causes | Blank 2"), and keep a brief note to refer to the table/organizer instead of copying it.
</math_and_references>

<output_fields>
- questionNumber: as shown in document (always a string). If numbering includes letters like "16a/16b/16c", treat each lettered part as its own separate question entry (never merge lettered parts together).
- questionText: FULL question with instruction (e.g., "Solve for x: 3x + 5 = 20", not just "3x + 5 = 20"). If no instruction given, add one (Solve/Simplify/Factor/etc). If it references a passage/figure, include that reference.
- questionType: "multiple_choice" | "single_value" | "short_answer" | "free_response" | "skipped"
- answerOptionsMCQ: array of choices (MCQ only)
- additionalInstructionsForAnswer: answer format requirements (e.g., "must be decimal")
- additionalInstructionsForWork: method requirements (e.g., "use quadratic formula")
</output_fields>

<expected_output>
- Respond with ONLY valid JSON array.
- [{"questionNumber": "1", "questionText": "...", "questionType": "...", ...}, ...]
</expected_output>
</prompt>`;

import type { ExtractedQuestion, GeneratedAnswer } from "../lib/types";

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

const ANSWER_PROMPT = `<prompt>
<context>
- QUESTION #{questionNumber}: {questionText}
- TYPE: {questionType}
{mcqOptionsSection}
- FORMAT: {additionalInstructionsForAnswer}
- METHOD: {additionalInstructionsForWork}
</context>

<response_rules>
- Answer using the notes provided.
- If the notes are missing information you need for the question, you MUST use Google Search to fetch supporting facts and ground your answer—any information not present in the notes must be obtained via web search.
- If no notes are provided, rely entirely on Google Search for the needed facts.
- When using search, prefer high-quality academic/encyclopedic sources (e.g., Britannica, Encyclopedia.com, JSTOR, .edu domains, reputable news/orgs) before other sites.
- When you have the final answer, respond ONLY with JSON matching the schema (answer, key_points, source). No prose or markdown.
- For answers: use a single string for multiple_choice/single_value/short_answer; use an array for free_response when needed.
</response_rules>

<mcq_rules>
- For multiple_choice answers, return ONLY the single letter of the correct option (A/B/C/...). Never include the option text.
</mcq_rules>

<key_points>
- Provide 1-2 key_points that are verbatim snippets copied directly from the source text (notes or search results). Do NOT paraphrase or summarize.
- Never use the question stem or the answer choice itself as a key_point. Only quote supporting evidence from the source.
- Each key_point MUST end with a bracketed source hint: "[notes]" if from teacher notes, "[passage | figure | table]" if from a provided passage/figure/table caption (select which one it is), or "[site]" for websites (e.g., "[britannica.com]").
</key_points>

<sourcing>
- If you used only notes, set source to "notes".
- If you used search, set source to the real URLs (no placeholders) and ensure key_points come from those URLs.
</sourcing>
</prompt>`;

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
  let mcqOptionsSection = "- ANSWER OPTIONS: none provided.";
  if (
    questionType === "multiple_choice" &&
    answerOptionsMCQ &&
    answerOptionsMCQ.length > 0
  ) {
    mcqOptionsSection =
      "- ANSWER OPTIONS (choose one):\n" +
      answerOptionsMCQ
        .map((option, i) => `  - ${String.fromCharCode(65 + i)}. ${option}`)
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

  try {
    const finalResponse = await withRetry(async () => {
      const response = await client.models.generateContent({
        model: MODELS.answerGeneration,
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }, ...notesParts],
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
      answerOptionsMCQ,
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
