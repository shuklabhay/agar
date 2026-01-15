"use node";

import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import type { TutorInput, TutorResponse } from "../lib/types";
import { keyPointTexts } from "../lib/keyPoints";

const TUTOR_MODEL = "gemini-2.0-flash-lite";

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  return new GoogleGenAI({ apiKey });
}

export async function warmTutorClient() {
  getClient();
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
- Do not ever use Markdown in your messages (no bold, italics, lists, etc).
- Do not end messages with generic questions (e.g., "Ready?", "Understood?").
- Always end messages with specific guiding questions or strategic choices.
- If users are are stuck, give a strategy/hints/clues and gradually increase support.
- Never ask low-value conversation-continuing questions like: "Do you want to try another question?"
- Always reply to questions the user asks; make sure their needs are addressed, dont just impose teaching ways.
- Never refer to the 'document'; instead refer to 'classroom instruction' 
</general_guidelines>

<teaching_strategy>
- Use RELEVANT CONCEPTS to anchor hints and questions when applicable; try to help the student articulate those ideas.
- Try to use socratic teaching strategies:
- Offer Alternatives: If a student is stuck, provide options (e.g., "You could try approach X or approach Y. Which do you prefer?").
- Scaffold Thinking: Instead of giving the next step, ask the student what they think the next step is.
- Handling Errors: If incorrect, name the mismatch and ask a question to prompt self-correction (e.g., "That would work for a square, but what shape is this?").
- Always keep turns to 1-3 sentences.
- Do not repeat information unless to repeat; each new 'hint' should provide new information.
- Point out incorrect assumptions or information that the user makes
</teaching_strategy>

<multiple_choice_questions>
- The answer letter and the letter content are both valid answers.
- Never repeat all answer choices.
- If the student guesses incorrectly, help them eliminate that option with a specific reason, then ask them to re-evaluate the remaining choices.
</multiple_choice_questions>

<free_response_questions>
- Help the user first form a clear thesis, then scaffold supporting evidence, and finally write the essay out.
- The provided "answer" is a guide, not a strict requirement.
- Encourage the user to write specific, nuanced, efficient arguments. 
- Don't be overly pedantic scoring response -- a 10th or 11th grade knowledge level is enough. Once the main idea and key support points are present with no major errors, treat it as acceptable and ask if they want to submit or tweak a detail instead of pushing more revisions.
- DO NOT GRADE ROUGH DRAFTS/MARK THEM AS COMPLETE: If the response is clearly incomplete, help them add what is missing. If it is already coherent and covers the key points, you may grade it without waiting for explicit permission.
- An essay should only be marked as 'correct' when the essay is structurally complete (clear beginning/middle/end), contains little to no logical flaws or gramatical errors, fully addresses the prompt, contains minimal 'fluff' or redundancy, and meets the critieria in REQUIRED_METHODS (when criteria is present). If any of these are not met, inform the user about what they need to revise.
</free_response_questions>

<short_answer_questions>
- Check for matching key ideas and non-ambiguous phrasing.
</short_answer_questions>

<single_value_questions>
- Check the numeric/value answer (and unit/precision if relevant).
- For math, equivalent equations are fine unless otherwise specified.
</single_value_questions>

<tools_and_logging>
- Call \`evaluate_response\` as soon as the student gives a clear, gradable answer (especially for short answers), even if they didn't explicitly ask you to grade.
- Do NOT call \`evaluate_response\` when the student is just asking for reasoning, explanation, or hints; give reasoning and a guiding question instead.
- If QUESTION_ATTEMPTS > 1, ask the user to explain their rationale before calling a response evaluation.
- Whenever you do call the tool, include isCorrect, missingPoints, detectedAnswer.
- Do not ask for submission confirmation once an answer is complete; just mark it correct/incorrect and explain briefly.
</tools_and_logging>`;

export async function callTutorLLM(input: TutorInput): Promise<TutorResponse> {
  const client = getClient();

  const detectedAnswerFromMessage =
    input.question.questionType === "multiple_choice"
      ? detectMCQGuess(input.studentMessage, input.question.answerOptionsMCQ)
      : undefined;

  const relevantKeyPoints = keyPointTexts(input.question.keyPoints);

  const questionContext = `
QUESTION: ${input.question.questionText}
TYPE: ${input.question.questionType}
QUESTION_NUMBER: ${input.question.questionNumber ?? "unknown"}
${input.question.answerOptionsMCQ ? `OPTIONS:\n${input.question.answerOptionsMCQ.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("\n")}` : ""}
QUESTION_ATTEMPTS: ${input.attempts ?? 0}
STUDENT_SELECTED_OPTION_THIS_TURN: ${input.selectedOption ?? "none"}
STUDENT_DETECTED_ANSWER: ${detectedAnswerFromMessage ?? "none"}
ATTACHMENTS_INCLUDED: ${input.files?.map((f) => f.name).join(", ") || "none"}

[HIDDEN - For guidance only]
CORRECT ANSWER: ${JSON.stringify(input.question.answer)}
${relevantKeyPoints.length ? `RELEVANT CONCEPTS: ${relevantKeyPoints.join(" | ")}` : ""}
${input.question.additionalInstructionsForWork ? `REQUIRED METHODS: Student must use this approach: ${input.question.additionalInstructionsForWork}` : ""}
`;

  const conversationHistory = input.history.map((m) => ({
    role: m.role === "student" ? ("user" as const) : ("model" as const),
    parts: [{ text: m.content }],
  }));

  const fileParts: Array<{ inlineData: { data: string; mimeType: string } }> =
    [];
  if (input.files && input.files.length > 0) {
    for (const file of input.files) {
      const base64Data = file.data.split(",")[1] || file.data;
      fileParts.push({
        inlineData: {
          data: base64Data,
          mimeType: file.type,
        },
      });
    }
  }

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

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];

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

    let message = messageFromParts.trimEnd();
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
      message: "I'm having trouble connecting right now, let's try again.",
    };
  }
}
