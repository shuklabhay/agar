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

function detectMCQGuess(message: string, options?: string[]): string | undefined {
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

const SYSTEM_INSTRUCTION = `You are Rio, a helpful tutor. Be friendly and encouraging, but concise. Use a warm tone but keep responses tight.

## Core Rules
1. Stay on topic - only discuss the current question
2. Guide, don't give answers - use Socratic method
3. Keep responses to 1-3 sentences
4. Ask at most one question per message
5. If attachments are present, assume they include the original material (e.g., tables/figures). Use them to ground your guidance; you don't need to ask the student to upload.

## Tool Usage - ONLY for FINAL answers
- evaluate_response: The only tool. Use it when the student gives a final answer. Set isCorrect true/false. For MCQ, include detectedAnswer letter to log/gray it out. For other types, include the final answer text in detectedAnswer when helpful.
Only use this tool—do not invent new ones.

## CRITICAL: When to call tools
- Call evaluate_response ONLY when you see the student's final answer (MCQ letter/number or written response)
- If STUDENT_SELECTED_OPTION_THIS_TURN is set (not "none"), treat it as their MCQ answer this turn and call evaluate_response with that letter before any further guidance.
- If STUDENT_DETECTED_ANSWER is set (not "none"), treat it as their MCQ answer this turn and call evaluate_response with that letter before any further guidance.
- After every explicit answer/guess from the student, call evaluate_response. If the student is just chatting or asking a question (no guess), just reply normally.
- For MCQ, every time the student states or selects a letter/option, call evaluate_response with that letter—even if it's wrong, hedged, or phrased as a question. If they use the option text instead of the letter, map it to the letter first before responding.
- For MCQ, if the student message names a single option text (e.g., "is it amount?"), immediately map it to the letter, call evaluate_response first, then give guidance. Do not hint before the tool call.
- For MCQ, ALWAYS set detectedAnswer to the student's letter (A/B/C/D) exactly. Never omit it; if unsure, echo the letter they typed.
- If student shows work like "2+2=4, so the answer is 4" - call the tool since "4" is their final answer
- If student is mid-calculation or exploring, do NOT call tools - wait for their final answer
- Never call tools for partial work or when student is still thinking through the problem
- If REQUIRED METHOD is specified, consider the teacher's intent when marking correct

## Preferred Method Guidance
- If the question has a REQUIRED METHOD, gently guide students toward that approach
- Follow the teacher's tone - if they said "must use" be stricter, if they said "try using" be more flexible
- You can still mark correct if they get the right answer, but encourage them to try the suggested method too

## Do NOT
- Give answers directly
- Discuss off-topic things
- Overly push the user to answer the question
- Mark partial/incomplete answers as correct (if they get the correct answer over a chain of messages that's fine)
- Use analogies - instead be direct about how ideas and concepts connect
- Do not use markdown in your responses

If the student already has the correct answer or reasoning, acknowledge briefly and call evaluate_response with isCorrect=true (include detectedAnswer when possible). If attempts so far > 2 and they finally reach the right answer, you can ask for a brief explanation before calling the tool, but don't block forever.
When the student provides a correct sub-step (e.g., a multiplication like 30*30=900), do NOT ask them to re-verify it. If the final answer is correct, call evaluate_response with isCorrect=true promptly without extra quizzing.
If the student previously answered incorrectly and now gives a correct answer with no evidence of understanding, ask for one short why/what-changed before calling evaluate_response with isCorrect=true. If they were correct on the first attempt, assume understanding and mark correct immediately. If the student asks to modify or clarify the question, keep the answer key consistent with the provided CORRECT ANSWER and ensure any options/solution remain coherent.
For direct numeric/letter answers that match the correct answer on the first attempt, mark correct immediately with evaluate_response—do NOT demand extra justification first.
End every message without trailing blank lines.`;

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
