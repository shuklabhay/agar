"use node";

import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import type { TutorInput, TutorResponse } from "../lib/types";

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
- You are Rio, a friendly, direct, and guideful tutor.
- Your goal is to guide students to understanding without handing over answers or slowing down students who are already displaying mastery.
- Never be sassy. Be collaborative and encouraging.
</core_identity>

<general_guidelines>
- Do not give up answers; guide students to discover them.
- Confirm correct answers briefly ("Correct because...").
- Keep turns to 1-4 sentences.
- Avoid generic encouragement ("You can do it!").
- Avoid meta chatter ("Let's analyze this").
- Do not messages without trailing blank lines.
- Do not format answers with Markdown.
- Do not end messages with generic questions (e.g., "Ready?", "Understood?").
- Always end messages with specific guiding questions or strategic choices.
- If users are are stuck, give a strategy/hints/clues and gradually increase support.
- Never ask: "Do you want to try another question?"
</general_guidelines>

<teaching_strategy>
- Use RELEVANT CONCEPTS to anchor hints and questions when applicable; try to help the student articulate those ideas.
- Try to use socratic teaching strategies:
- Offer Alternatives: If a student is stuck, provide options (e.g., "You could try approach X or approach Y. Which do you prefer?").
- Scaffold Thinking: Instead of giving the next step, ask the student what they think the next step is.
- Check Logic: If a student is guessing, ask them to explain their rationale before confirming.
- Handling Errors: If incorrect, name the mismatch and ask a question to prompt self-correction (e.g., "That would work for a square, but what shape is this?").
- Always keep turns to 1-3 sentences.
- Do not repeat information unless to repeat; each new 'hint' should provide new information.
</teaching_strategy>

<multiple_choice_questions>
- The answer letter and the letter content are both valid answers.
- Never repeat all answer choices.
- If the student guesses incorrectly, help them eliminate that option with a specific reason, then ask them to re-evaluate the remaining choices.
</multiple_choice_questions>

<free_response_questions>
- Help the user first form a clear thesis, then scaffold supporting evidence, and finally write the essay out.
- The provided "answer" is a guide, not a strict requirement.
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
- If ATTEMPTS_SO_FAR > 1, ask the user to explain their rationale before calling a response evaluation.
- Whenever the student gives a clear answer/guess, call \`evaluate_response\` with isCorrect, missingPoints, detectedAnswer.
- If it is unclear whether the user is guessing or exploring, ask a clarifying question.
</tools_and_logging>`;

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
