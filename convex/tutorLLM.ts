"use node";

import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";

const TUTOR_MODEL = "gemini-2.0-flash";

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
          description: "Brief explanation of why the answer is being marked correct",
        },
        detectedAnswer: {
          type: Type.STRING,
          description: "The answer the student provided (letter for MCQ, number for numerical)",
        },
      },
      required: ["reasoning", "detectedAnswer"],
    },
  },
  {
    name: "provide_hint",
    description:
      "Provide a structured hint to help the student. Use level 1 for subtle hints, level 2 for more direct guidance, level 3 for very explicit help.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        level: {
          type: Type.NUMBER,
          description: "Hint level 1-3 (1=subtle, 3=very direct)",
        },
        hint: {
          type: Type.STRING,
          description: "The hint content",
        },
      },
      required: ["level", "hint"],
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
];

const SYSTEM_PROMPT = `You are a focused tutor helping a student with their assignment. Stay ON TOPIC - only discuss the current question.

## Rules
1. ONLY discuss the current question. If student asks about anything else, redirect them.
2. Use Socratic method - guide with questions, don't give answers directly
3. When student states the CORRECT answer, use mark_answer_correct tool IMMEDIATELY
4. For written answers, use evaluate_response tool when they submit a complete answer
5. Keep responses SHORT (1-3 sentences)
6. If student uploads work, analyze it and provide feedback related to the question

## DO NOT
- Discuss unrelated topics
- Give the answer directly
- Have general conversations
- Answer questions about other subjects

## Tools
- mark_answer_correct: When student gives correct answer
- provide_hint: When student is stuck (level 1-3)
- evaluate_response: For checking written answers`;

interface TutorInput {
  question: {
    questionText: string;
    questionType: string;
    options?: string[];
    answer?: string | string[];
    snippets?: string[];
  };
  history: Array<{ role: string; content: string }>;
  studentMessage: string;
  files?: Array<{ name: string; type: string; data: string }>;
  progress: { status: string; attempts: number } | null;
}

interface TutorResponse {
  message: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
}

export async function callTutorLLM(input: TutorInput): Promise<TutorResponse> {
  const client = getClient();

  // Build context for the tutor
  const questionContext = `
QUESTION: ${input.question.questionText}
TYPE: ${input.question.questionType}
${input.question.options ? `OPTIONS:\n${input.question.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("\n")}` : ""}

[HIDDEN - For guidance only]
CORRECT ANSWER: ${JSON.stringify(input.question.answer)}
RELEVANT CONCEPTS: ${input.question.snippets?.join(" | ") || "None provided"}

STUDENT PROGRESS: ${input.progress?.attempts || 0} attempts, status: ${input.progress?.status || "not_started"}
`;

  // Build conversation history
  const conversationHistory = input.history.map((m) => ({
    role: m.role === "student" ? "user" : "model",
    parts: [{ text: m.content }],
  }));

  // Build full context prompt
  const fullContext = `${SYSTEM_PROMPT}\n\n${questionContext}`;

  // Build file parts if files are provided
  const fileParts: Array<{ inlineData: { data: string; mimeType: string } }> = [];
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

  // For first message, include context. For continued conversations, prepend context to first user message
  let messages;
  if (conversationHistory.length === 0) {
    messages = [
      {
        role: "user" as const,
        parts: [
          { text: `${fullContext}\n\nStudent says: ${input.studentMessage}` },
          ...fileParts,
        ],
      },
    ];
  } else {
    // Prepend context to the first message in history
    const historyWithContext = [...conversationHistory];
    if (historyWithContext.length > 0 && historyWithContext[0].role === "user") {
      historyWithContext[0] = {
        ...historyWithContext[0],
        parts: [{ text: `${fullContext}\n\n${historyWithContext[0].parts[0].text}` }],
      };
    }
    messages = [
      ...historyWithContext,
      {
        role: "user" as const,
        parts: [{ text: input.studentMessage }, ...fileParts],
      },
    ];
  }

  try {
    const response = await client.models.generateContent({
      model: TUTOR_MODEL,
      contents: messages,
      config: {
        tools: [{ functionDeclarations: TUTOR_TOOLS }],
      },
    });

    // Parse response
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    let message = "";
    const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

    for (const part of parts) {
      if (part.text) {
        message += part.text;
      }
      if (part.functionCall && part.functionCall.name) {
        toolCalls.push({
          name: part.functionCall.name,
          args: (part.functionCall.args as Record<string, unknown>) || {},
        });
      }
    }

    // If no message but has tool calls, generate a friendly response
    if (!message && toolCalls.length > 0) {
      const toolCall = toolCalls[0];
      if (toolCall.name === "mark_answer_correct") {
        message = "That's correct! Great job working through this problem.";
      } else if (toolCall.name === "provide_hint") {
        message = (toolCall.args.hint as string) || "Let me give you a hint...";
      } else if (toolCall.name === "evaluate_response") {
        const isCorrect = toolCall.args.isCorrect as boolean;
        const feedback = toolCall.args.feedback as string;
        message = isCorrect
          ? `Excellent! ${feedback}`
          : `${feedback}`;
      }
    }

    return {
      message: message || "I'm here to help! What would you like to know about this question?",
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
