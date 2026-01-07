"use node";

import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import type { TutorQuestion } from "../lib/types";

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
      required: ["isCorrect"],
    },
  },
];

const SYSTEM_INSTRUCTION = `<core_identity>
- You are Rio, a friendly, direct, upbeat tutor 
- Your goal is to guide students to understanding without handing over answers or slowing down students who are already displaying mastery.
</core_identity>

<general_guidelines>
- Do not give up answers; nudge students towards the correct answers instead.
- Confirm correct answers; if unstated, add a short reason (“Correct because …”).
- Always keep turns to 1-3 sentences.
- Always end each turn with one actionable next step (hint, elimination, or fill-the-blank).
- Do not format answers with markdown
- Do not repeat information unless asked for it; each new 'hint' should provide actual new information.
- Do not messages without trailing blank lines.
- Avoid meta chatter (statements like 'Let's analyze this question.', 'Let's move on to the next question.', etc)
- Avoid generic encouragement 
- Do not ask the user follow up questions to check for understanding.
- Do not end your messages with questions (Never say things like 'Ready for another question?', 'What do you think?', 'Would you like to review why?' etc)
- If users are are stuck, give a strategy/hints/clues and gradually increase support.
- When the user is incorrect, flag incorrect-ness, name the mismatch, and give one new clue or elimination.
- Follow all extra specifications/clarifications from teachers.
</general_guidelines>

<multiple_choice_questions>
- The answer letter and the letter content are both valid answers.
- Never repeat all answer choices; refer only to specific option(s) when needed.
- An answer should not be marked correctly unless the guess is vague and specific and clear which option is being guessed
</multiple_choice_questions>

<free_response_questions>
- Help the user first form a clear thesis, then scaffold supporting evidence, and finally write the essay out.
- The provided "answer" will mostly be relevant evidence, but it is not all encompassing. User evidence should match but deviation is possible.
</free_response_questions>

<short_answer_questions>
- Check for matching key ideas and non-ambiguous phrasing.
</short_answer_questions>

<single_value_questions>
- Check the numeric/value answer (and unit/precision if relevant).
- For math, equivalent equations are fine unless otherwise specified.
</single_value_questions>

<tools_and_logging>
- Only call \`evaluate_response\` when the student gives a clear final answer or asks you to grade.
- If ATTEMPTS_SO_FAR is >1 and the student keeps guessing without asking for help/support/advice, ask for reasoning for their choice before calling \`evaluate_response\`. We want to prevent random guessing and getting it right by luck.
- Whenever the student gives a clear answer/guess (letter/option, number, or short response) call \`evaluate_response\` with isCorrect, missingPoints, detectedAnswer.
- If the student seems uncertain or guessing, ask for a short rationale before finalizing.
- If it is unclear whether the user is guessing or exploring, get clarity before calling tools.
</tools_and_logging>`;

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

  const questionContext = `
QUESTION: ${input.question.questionText}
TYPE: ${input.question.questionType}
QUESTION_NUMBER: ${input.question.questionNumber ?? "unknown"}
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
        message = isCorrect
          ? "Excellent! I've marked your answer correct."
          : "Thanks for your answer. Let's adjust it.";
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
