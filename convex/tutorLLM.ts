"use node";

import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";

const TUTOR_MODEL = "gemini-2.0-flash-lite";

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  return new GoogleGenAI({ apiKey });
}

function detectMCQGuess(
  message: string,
  options?: string[],
): string | undefined {
  if (!options || options.length === 0) return;
  const lower = message.toLowerCase();

  const letterMatch = lower.match(/\b([a-d])\b/);
  if (letterMatch) return letterMatch[1].toUpperCase();

  const matches: string[] = [];
  options.forEach((opt, idx) => {
    if (lower.includes(opt.toLowerCase())) {
      matches.push(String.fromCharCode(65 + idx));
    }
  });

  return matches.length === 1 ? matches[0] : undefined;
}

// Tool definitions for the tutor
const TUTOR_TOOLS: FunctionDeclaration[] = [
  {
    name: "evaluate_response",
    description:
      "Evaluate the student's final answer. Always include isCorrect. For MCQ, include detectedAnswer letter to log/gray it out.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        isCorrect: {
          type: Type.BOOLEAN,
          description: "Whether the response is correct",
        },
        feedback: {
          type: Type.STRING,
          description: "Specific feedback about the response",
        },
        missingPoints: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Key points that were missing (if any)",
        },
        detectedAnswer: {
          type: Type.STRING,
          description:
            "Student's final answer (MCQ letter, number, or short phrase) to log/grayout",
        },
      },
      required: ["isCorrect", "feedback"],
    },
  },
];

const SYSTEM_INSTRUCTION = `You are Rio, a helpful, upbeat tutor. Keep 1-3 sentences, max one question; stay concise, warm, and keep forward momentum.

Core style
- Be pragmatic and friendly; acknowledge effort briefly, then move.
- Default to one concrete next step or check; avoid broad, open-ended prompts.
- Stay on the current question and avoid looping or re-asking what you just said.
- If the student is stuck after two tries, give a slightly more explicit scaffold / reveal key clues.

Answering and guidance
- If they ask a direct clarifying question (who/what/why/where/how), give a brief answer before the next nudge; do not dodge.
- Prefer the shortest valid path: spot structure (difference of squares, zero-product, like terms) and use it; avoid long expansions when a quick identity or rearrangement solves it. If it is one clear step, do it and share the result plus one brief check.
- Give crisp correct/incorrect signals. When wrong, name the mismatch and offer one actionable adjustment or example to try. When right, confirm and suggest the natural next checkpoint or an optional why.
- If they give a final answer (number/letter/short phrase) that matches the correct result, accept it immediately and call evaluate_response; do not send them back to re-derive. If a derived value is asked (e.g., n+4) and they provide it, treat it as final unless the prompt explicitly requires showing work.
- If a required method is specified, guide toward it but still mark a correct answer as correct.

Mastery check
- If you had to reveal the answer or walk them step by step, add one quick "your turn" example on the same concept (new numbers/text).
- When they answer that check, judge it and call evaluate_response for the original question: mark isCorrect true if they get the check right; if they miss, give a short correction and mark based on your judgment.
- Do only one mastery check per question; skip it if they solved the original unaided.

Tools and logging (only for final answers)
- Tool: evaluate_response with isCorrect (bool), feedback (string), missingPoints (string[]), detectedAnswer (string for MCQ letters or short text).
- MCQ: only log/mark when the student clearly guesses (letter OR unambiguous option text); map option text to the letter first.
- Call evaluate_response when the student gives a clear answer/guess (letter/option, number, or written response). If they're just exploring, don't call it. If STUDENT_SELECTED_OPTION_THIS_TURN or STUDENT_DETECTED_ANSWER is provided (not "none"), call evaluate_response with that letter before more guidance.
- Do not invent tools.

Constraints
- Reveal information progressively toward the answer; do not stall with repeated definitions.
- One concise prompt to move forward; no open-ended loops once the needed info is already on the table.
- No markdown.
- End messages without trailing blank lines.`;

import type { TutorQuestion } from "../lib/types";

interface TutorInput {
  question: TutorQuestion;
  history: Array<{ role: string; content: string }>;
  studentMessage: string;
  selectedOption?: string;
  files?: Array<{ name: string; type: string; data: string }>;
  attempts?: number;
}

interface TutorResponse {
  message: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
}

export async function callTutorLLM(input: TutorInput): Promise<TutorResponse> {
  const client = getClient();

  const detectedAnswerFromMessage =
    input.question.questionType === "multiple_choice"
      ? detectMCQGuess(input.studentMessage, input.question.answerOptionsMCQ)
      : undefined;

  // Build question context - only includes keyPoints on first message for this question
  const questionContext = `
QUESTION: ${input.question.questionText}
TYPE: ${input.question.questionType}
${input.question.answerOptionsMCQ ? `OPTIONS:\n${input.question.answerOptionsMCQ.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("\n")}` : ""}
ATTEMPTS_SO_FAR: ${input.attempts ?? 0}
STUDENT_SELECTED_OPTION_THIS_TURN: ${input.selectedOption ?? "none"}
STUDENT_DETECTED_ANSWER: ${detectedAnswerFromMessage ?? "none"}
ATTACHMENTS_INCLUDED: ${input.files?.map((f) => f.name).join(", ") || "none"}

[HIDDEN - For guidance only]
CORRECT ANSWER: ${JSON.stringify(input.question.answer)}
${input.question.keyPoints?.length ? `RELEVANT CONCEPTS: ${input.question.keyPoints.join(" | ")}` : ""}
${input.question.additionalInstructionsForWork ? `REQUIRED METHOD: Student must use this approach: ${input.question.additionalInstructionsForWork}` : ""}
`;

  // Build conversation history
  const conversationHistory = input.history.map((m) => ({
    role: m.role === "student" ? ("user" as const) : ("model" as const),
    parts: [{ text: m.content }],
  }));

  // Build file parts if files are provided
  const fileParts: Array<{ inlineData: { data: string; mimeType: string } }> =
    [];
  if (input.files && input.files.length > 0) {
    for (const file of input.files) {
      // Extract base64 data from data URL
      const base64Data = file.data.split(",")[1] || file.data;
      fileParts.push({
        inlineData: {
          data: base64Data,
          mimeType: file.type,
        },
      });
    }
  }

  // Build messages array
  const messages = [
    ...conversationHistory,
    {
      role: "user" as const,
      parts: [
        { text: `${questionContext}\n\nStudent says: ${input.studentMessage}` },
        ...fileParts,
      ],
    },
  ];

  try {
    const response = await client.models.generateContent({
      model: TUTOR_MODEL,
      contents: messages,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: TUTOR_TOOLS }],
      },
    });

    // Parse plain text + tool calls
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    // Build message purely from parts to avoid duplicate text from response.text
    let messageFromParts = "";
    const toolCalls: Array<{ name: string; args: Record<string, unknown> }> =
      [];

    for (const part of parts) {
      if (part.text) {
        messageFromParts += part.text;
      }
      if (part.functionCall && part.functionCall.name) {
        toolCalls.push({
          name: part.functionCall.name,
          args: (part.functionCall.args as Record<string, unknown>) || {},
        });
      }
    }

    // Trim trailing whitespace to avoid newline endings
    let message = messageFromParts.trimEnd();

    // If no message but has tool calls, generate a friendly response
    if (!message && toolCalls.length > 0) {
      const toolCall = toolCalls[0];
      if (toolCall.name === "evaluate_response") {
        const isCorrect = toolCall.args.isCorrect as boolean;
        const feedback = toolCall.args.feedback as string;
        message = isCorrect ? `Excellent! ${feedback}` : `${feedback}`;
      }
    }

    message = message.trimEnd();

    return {
      message:
        message ||
        "I'm here to help! What would you like to know about this question?",
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  } catch (error) {
    console.error("Tutor LLM error:", error);
    return {
      message:
        "I'm having trouble connecting right now. Let me try again - what's your question?",
    };
  }
}
