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

// Tool definitions for the tutor
const TUTOR_TOOLS: FunctionDeclaration[] = [
  {
    name: "mark_answer_correct",
    description:
      "Call this when the student has clearly demonstrated understanding and stated the correct answer. Use this for MCQ when they identify the right choice, or for numerical answers when they state the correct number.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        reasoning: {
          type: Type.STRING,
          description:
            "Brief explanation of why the answer is being marked correct",
        },
        detectedAnswer: {
          type: Type.STRING,
          description:
            "The answer the student provided (letter for MCQ, number for numerical)",
        },
      },
      required: ["reasoning", "detectedAnswer"],
    },
  },
  {
    name: "evaluate_response",
    description:
      "Evaluate a free response or short answer submission. Call this when the student has provided a complete written answer that needs assessment.",
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
      },
      required: ["isCorrect", "feedback"],
    },
  },
  {
    name: "mark_answer_incorrect",
    description:
      "Log a clearly incorrect final answer (especially MCQ letters/numbers) so the UI can gray it out. Use this when the student commits to a wrong choice.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        reasoning: {
          type: Type.STRING,
          description: "Brief reason why the answer is being marked wrong",
        },
        detectedAnswer: {
          type: Type.STRING,
          description: "The answer the student provided (e.g. MCQ letter)",
        },
      },
      required: ["reasoning", "detectedAnswer"],
    },
  },
];

const SYSTEM_INSTRUCTION = `You are Rio, a helpful tutor. Be friendly and encouraging, but concise. Use a warm tone but keep responses tight.

## Core Rules
1. Stay on topic - only discuss the current question
2. Guide, don't give answers - use Socratic method
3. Keep responses to 1-3 sentences
4. Ask only ONE focused question per reply (or none if you've marked an answer). Never chain multiple questions.
5. Treat each question fresh—do not carry suspicion or verification demands from previous questions.

## Tool Usage - ONLY for FINAL answers
- mark_answer_correct: ONLY when student clearly states the correct FINAL answer
- evaluate_response: ONLY when student submits a complete written answer
- mark_answer_incorrect: When the student locks in a clearly wrong MCQ letter/number
Only use these tools—do not invent new ones.

## CRITICAL: When to call tools
- Call mark_answer_correct ONLY when you see the correct answer as the student's final conclusion. If you tell them they're right, you MUST call the tool.
- If ATTEMPTS_SO_FAR <= 1 and the answer is correct, mark it correct immediately without demanding more explanation.
- If student shows work like "2+2=4, so the answer is 4" - call the tool since "4" is their final answer
- If student is mid-calculation or exploring, do NOT call tools - wait for their final answer
- Never call tools for partial work or when student is still thinking through the problem
- If a student commits to an MCQ letter/number that is wrong, call mark_answer_incorrect to log it, then briefly guide with ONE next step.
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

If the student already has the correct answer or reasoning, acknowledge briefly and mark correct immediately—especially on the first attempt. If attempts so far > 2 and they finally reach the right answer, you can ask for ONE brief explanation before calling tools, but don't block forever.
When the student provides a correct sub-step (e.g., a multiplication like 30*30=900), do NOT ask them to re-verify it. If the final answer is correct, call mark_answer_correct (or evaluate_response with isCorrect=true) promptly without extra quizzing.
If the student asks to modify or clarify the question, keep the answer key consistent with the provided CORRECT ANSWER and ensure any options/solution remain coherent.
End every message without trailing blank lines.`;

import type { TutorQuestion } from "../lib/types";

interface TutorInput {
  question: TutorQuestion;
  history: Array<{ role: string; content: string }>;
  studentMessage: string;
  files?: Array<{ name: string; type: string; data: string }>;
  attempts?: number;
}

interface TutorResponse {
  message: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
}

export async function callTutorLLM(input: TutorInput): Promise<TutorResponse> {
  const client = getClient();

  // Build question context - only includes keyPoints on first message for this question
  const questionContext = `
QUESTION: ${input.question.questionText}
TYPE: ${input.question.questionType}
${input.question.answerOptionsMCQ ? `OPTIONS:\n${input.question.answerOptionsMCQ.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("\n")}` : ""}
ATTEMPTS_SO_FAR: ${input.attempts ?? 0}

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
      if (toolCall.name === "mark_answer_correct") {
        message = "That's correct! Great job working through this problem.";
      } else if (toolCall.name === "evaluate_response") {
        const isCorrect = toolCall.args.isCorrect as boolean;
        const feedback = toolCall.args.feedback as string;
        message = isCorrect ? `Excellent! ${feedback}` : `${feedback}`;
      } else if (toolCall.name === "mark_answer_incorrect") {
        const reasoning =
          (typeof toolCall.args.reasoning === "string"
            ? toolCall.args.reasoning
            : "") || "";
        message = reasoning;
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
