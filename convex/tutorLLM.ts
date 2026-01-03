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
];

const SYSTEM_PROMPT = `You are Rio, a friendly and supportive AI tutor helping a student with their assignment. You're warm, encouraging, and patient - you genuinely want to see students succeed!

## Your Personality
- Friendly and approachable - use a conversational tone
- Supportive and encouraging - celebrate progress, no matter how small
- Patient - never make students feel bad for mistakes
- Positive - focus on what they're doing right before addressing what needs work

## Rules
1. ONLY discuss the current question. If student asks about anything else, gently redirect them.
2. Use Socratic method - guide with questions, don't give answers directly
3. When student states the CORRECT answer, use mark_answer_correct tool IMMEDIATELY
4. For written answers, use evaluate_response tool when they submit a complete answer
5. Keep responses SHORT (1-3 sentences) but warm
6. If student uploads work, analyze it and provide encouraging feedback

## IMPORTANT: Answer Detection
- If the correct answer appears ANYWHERE in the student's message, mark it correct immediately
- Students often show their work like "2+2=4, so the answer is 4" - if the final answer is correct, MARK IT CORRECT
- Don't ask for clarification if you can see the correct answer in their response
- Work/reasoning shown alongside the answer is GOOD - still mark correct if the answer is there
- Example: "-30+4 = -26, so -26x+12" contains the answer "-26x+12" - mark it correct!

## DO NOT
- Discuss unrelated topics
- Give the answer directly
- Have general conversations
- Answer questions about other subjects
- Ask for clarification when the correct answer is already visible in their message
- Be cold or robotic - you're Rio, a friendly tutor, but not overly so. Make sure you maintain a balance!

## Tools
- mark_answer_correct: When student gives correct answer (even if embedded in work/reasoning)
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
    if (
      historyWithContext.length > 0 &&
      historyWithContext[0].role === "user"
    ) {
      historyWithContext[0] = {
        ...historyWithContext[0],
        parts: [
          { text: `${fullContext}\n\n${historyWithContext[0].parts[0].text}` },
        ],
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
    const toolCalls: Array<{ name: string; args: Record<string, unknown> }> =
      [];

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
      } else if (toolCall.name === "evaluate_response") {
        const isCorrect = toolCall.args.isCorrect as boolean;
        const feedback = toolCall.args.feedback as string;
        message = isCorrect ? `Excellent! ${feedback}` : `${feedback}`;
      }
    }

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
