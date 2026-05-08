import { VercelRequest, VercelResponse } from "@vercel/node";
import {
  GoogleGenerativeAI,
  SchemaType,
  type GenerationConfig,
} from "@google/generative-ai";
import { getGeminiModelNameFromEnv } from "../_lib/geminiModel.js";
import { notifyDiscord } from "../_lib/discordLogger.js";

interface EvaluationRequest {
  questionId: string;
  questionText: string;
  questionType: "SHORT_ANSWER" | "UPLOAD";
  referenceAnswer?: string;
  referenceAnswerImageUrl?: string;
  referenceKeywords?: string[];
  evaluationInstructions?: string;
  studentAnswer: string; // text for short_answer, imageUrl for upload
  maxScore: number;
}

interface EvaluationResponse {
  score: number;
  maxScore: number;
  confidence: number;
  feedback: string;
  keywordMatches?: string[];
  evaluatedAt: number;
}

const evaluationSchema = {
  type: SchemaType.OBJECT,
  properties: {
    score: { type: SchemaType.NUMBER },
    maxScore: { type: SchemaType.NUMBER },
    confidence: { type: SchemaType.NUMBER },
    feedback: { type: SchemaType.STRING },
    keywordMatches: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
  },
  required: ["score", "maxScore", "confidence", "feedback"],
} as const;

const SYSTEM_INSTRUCTION = [
  "You are an expert academic evaluator for exam grading.",
  "You evaluate student answers against reference answers and provide fair, detailed scoring.",
  "",
  "Evaluation guidelines:",
  "- Compare the student's answer to the reference answer for semantic similarity.",
  "- Award partial marks for partially correct answers.",
  "- Check for keyword presence if keywords are provided.",
  "- Consider the meaning and understanding, not just exact word matching.",
  "- Be fair but rigorous — do not award marks for vague or incorrect answers.",
  "- For uploaded image answers, carefully read and interpret the handwritten content.",
  "- If a reference answer image is provided, use it alongside the text reference.",
  "- If ans for mathematical questions are not same award marks for steps cut marks for incorrect answer",
  "",
  "Response fields:",
  "- score: The marks awarded (0 to maxScore). Must be a reasonable number.",
  "- maxScore: The maximum possible marks (same as input).",
  "- confidence: Your confidence in the evaluation (0.0 to 1.0).",
  "  Use lower confidence (0.3-0.6) when the answer is ambiguous or hard to read.",
  "- feedback: 3-5 sentences explaining the grade. Must explicitly state why marks were awarded",
  "  and why marks were deducted. Mention which parts earned marks and which were missing/incorrect.",
  "- keywordMatches: Which of the expected keywords were found in the student's answer.",
].join("\n");

const ALLOWED_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

async function fetchImageInlinePart(url: string, label: string) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return null;

  const res = await fetch(trimmed);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${label} image (${res.status})`);
  }

  const contentTypeRaw = res.headers.get("content-type") || "image/jpeg";
  const mimeType = contentTypeRaw.split(";")[0].trim().toLowerCase();

  if (!ALLOWED_IMAGE_MIME.has(mimeType)) {
    throw new Error(`Unsupported ${label} image type: ${mimeType}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const byteLength = arrayBuffer.byteLength;
  if (byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`The ${label} image is too large. Please upload a smaller file.`);
  }

  return {
    inlineData: {
      data: Buffer.from(arrayBuffer).toString("base64"),
      mimeType,
    },
  };
}

async function buildRequestParts(req: EvaluationRequest) {
  const referenceAnswer = String(req.referenceAnswer || "").trim();
  const hasReferenceText = Boolean(referenceAnswer);
  const hasReferenceImage = Boolean(String(req.referenceAnswerImageUrl || "").trim());
  const hasStudentImage = req.questionType === "UPLOAD" && Boolean(String(req.studentAnswer || "").trim());

  const lines = [
    "EVALUATE THIS STUDENT ANSWER:",
    "",
    `Question: ${req.questionText}`,
    `Maximum Marks: ${req.maxScore}`,
    "",
    `Reference Answer: ${hasReferenceText ? referenceAnswer : "(not provided)"}`,
  ];

  if (hasReferenceImage) {
    lines.push("Reference Answer Image is attached.");
  }

  if (req.referenceKeywords?.length) {
    lines.push(`Expected Keywords: ${req.referenceKeywords.join(", ")}`);
  }

  if (req.evaluationInstructions) {
    lines.push(`Evaluation Instructions: ${req.evaluationInstructions}`);
  }

  lines.push("");

  if (req.questionType === "UPLOAD") {
    lines.push(hasStudentImage ? "Student Answer Image is attached." : "Student Answer Image: (not provided)");
  } else {
    lines.push(`Student Answer: ${req.studentAnswer}`);
  }

  lines.push("");
  lines.push("Evaluate the student's answer and provide a score, confidence level, and constructive feedback.");
  lines.push("In feedback, explicitly mention the awarded score and why marks were deducted (if any).");

  const parts: any[] = [lines.join("\n")];

  if (hasReferenceImage) {
    try {
      const referenceImagePart = await fetchImageInlinePart(req.referenceAnswerImageUrl || "", "reference");
      if (referenceImagePart) parts.push(referenceImagePart);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[evaluate-subjective] Reference image skipped: ${msg}`);
    }
  }

  if (hasStudentImage) {
    const studentImagePart = await fetchImageInlinePart(req.studentAnswer || "", "student");
    if (studentImagePart) parts.push(studentImagePart);
  }

  return parts;
}

async function evaluateWithGemini(parts: any[], maxScore: number): Promise<EvaluationResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  const generationConfig: GenerationConfig = {
    temperature: 0.3,
    maxOutputTokens: 2048,
    responseMimeType: "application/json",
    responseSchema: evaluationSchema as any,
  };

  const model = genAI.getGenerativeModel({
    model: getGeminiModelNameFromEnv(),
    generationConfig,
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  const result = await model.generateContent(parts);
  const text = result.response.text();
  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  const parsed = JSON.parse(text) as EvaluationResponse;

  parsed.score = Math.max(0, Math.min(maxScore, Number(parsed.score) || 0));
  parsed.maxScore = maxScore;
  parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));
  parsed.evaluatedAt = Date.now();

  return parsed;
}

interface BatchEvaluationRequest {
  evaluations: EvaluationRequest[];
}

interface BatchEvaluationResponse {
  results: Record<string, EvaluationResponse>;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body;

    if (Array.isArray(body?.evaluations)) {
      const { evaluations } = body as BatchEvaluationRequest;
      if (!evaluations.length) {
        return res.status(400).json({ error: "No evaluations provided" });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
      }

      const results: Record<string, EvaluationResponse> = {};

      for (const evalReq of evaluations) {
        try {
          const parts = await buildRequestParts(evalReq);
          const result = await evaluateWithGemini(parts, evalReq.maxScore);
          results[evalReq.questionId] = result;
        } catch (err) {
          console.error(`[evaluate-subjective] Failed for question ${evalReq.questionId}:`, err);
          results[evalReq.questionId] = {
            score: 0,
            maxScore: evalReq.maxScore,
            confidence: 0,
            feedback: "Evaluation failed. This answer will be reviewed manually.",
            evaluatedAt: Date.now(),
          };
        }
      }

      return res.status(200).json({ results } as BatchEvaluationResponse);
    }

    const evalReq = body as EvaluationRequest;

    if (!evalReq.questionText || !evalReq.studentAnswer) {
      return res.status(400).json({ error: "Missing questionText or studentAnswer" });
    }

    if (!evalReq.questionType) {
      return res.status(400).json({ error: "Missing questionType" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
    }

    const parts = await buildRequestParts(evalReq);
    const result = await evaluateWithGemini(parts, evalReq.maxScore || 5);

    return res.status(200).json(result);
  } catch (error) {
    console.error("[evaluate-subjective] Unhandled error:", error);
    await notifyDiscord(error, req, "evaluate-subjective");
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}
