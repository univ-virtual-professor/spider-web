import { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI, SchemaType, type GenerationConfig } from "@google/generative-ai";
import { getGeminiModelNameFromEnv } from "../_lib/geminiModel.js";
import { notifyDiscord, sendDiscordEmbed } from "../_lib/discordLogger.js";

interface EvaluationRequest {
  questionId: string;
  questionText: string;
  questionType: "SHORT_ANSWER" | "UPLOAD";
  referenceAnswer?: string;
  referenceAnswerImageUrl?: string; // legacy single image
  referenceAnswerImageUrls?: string[]; // multiple images (preferred)
  referenceKeywords?: string[];
  evaluationInstructions?: string;
  studentAnswer: string; // text for short_answer; unused for UPLOAD when studentAnswerImageUrls provided
  studentAnswerImageUrls?: string[]; // for UPLOAD type: multiple images
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

const ALLOWED_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const ALLOWED_IMAGE_HOSTS = new Set(["ik.imagekit.io", "imagekit.io"]);

function validateImageUrl(url: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid ${label} image URL`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${label} image URL must use HTTPS`);
  }
  if (!ALLOWED_IMAGE_HOSTS.has(parsed.hostname)) {
    throw new Error(`${label} image URL host is not allowed`);
  }
}

async function fetchImageInlinePart(url: string, label: string) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return null;

  validateImageUrl(trimmed, label);

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

function resolveReferenceImageUrls(req: EvaluationRequest): string[] {
  if (req.referenceAnswerImageUrls?.length) return req.referenceAnswerImageUrls.filter(Boolean);
  if (req.referenceAnswerImageUrl) return [req.referenceAnswerImageUrl];
  return [];
}

function resolveStudentImageUrls(req: EvaluationRequest): string[] {
  if (req.studentAnswerImageUrls?.length) return req.studentAnswerImageUrls.filter(Boolean);
  if (req.questionType === "UPLOAD" && req.studentAnswer?.startsWith("https://"))
    return [req.studentAnswer];
  return [];
}

async function buildRequestParts(req: EvaluationRequest) {
  const referenceAnswer = String(req.referenceAnswer || "").trim();
  const hasReferenceText = Boolean(referenceAnswer);
  const referenceImageUrls = resolveReferenceImageUrls(req);
  const studentImageUrls = resolveStudentImageUrls(req);
  const hasStudentImages = req.questionType === "UPLOAD" && studentImageUrls.length > 0;

  const lines = [
    "EVALUATE THIS STUDENT ANSWER:",
    "",
    `Question: ${req.questionText}`,
    `Maximum Marks: ${req.maxScore}`,
    "",
    `Reference Answer: ${hasReferenceText ? referenceAnswer : "(not provided)"}`,
  ];

  if (referenceImageUrls.length > 0) {
    lines.push(`Reference Answer: ${referenceImageUrls.length} image(s) attached.`);
  }

  if (req.referenceKeywords?.length) {
    lines.push(`Expected Keywords: ${req.referenceKeywords.join(", ")}`);
  }

  if (req.evaluationInstructions) {
    lines.push(`Evaluation Instructions: ${req.evaluationInstructions}`);
  }

  lines.push("");

  if (req.questionType === "UPLOAD") {
    lines.push(
      hasStudentImages
        ? `Student Answer: ${studentImageUrls.length} image(s) attached.`
        : "Student Answer Image: (not provided)"
    );
  } else {
    lines.push(`Student Answer: ${req.studentAnswer}`);
  }

  lines.push("");
  lines.push(
    "Evaluate the student's answer and provide a score, confidence level, and constructive feedback."
  );
  lines.push(
    "In feedback, explicitly mention the awarded score and why marks were deducted (if any)."
  );

  const parts: any[] = [lines.join("\n")];

  for (let i = 0; i < referenceImageUrls.length; i++) {
    try {
      const part = await fetchImageInlinePart(referenceImageUrls[i], `reference ${i + 1}`);
      if (part) parts.push(part);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[evaluate-subjective] Reference image ${i + 1} skipped: ${msg}`);
    }
  }

  for (let i = 0; i < studentImageUrls.length; i++) {
    try {
      const part = await fetchImageInlinePart(studentImageUrls[i], `student ${i + 1}`);
      if (part) parts.push(part);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[evaluate-subjective] Student image ${i + 1} skipped: ${msg}`);
      void sendDiscordEmbed("warning", "⚠️ Student image could not be loaded", [
        { name: "Question ID", value: req.questionId, inline: true },
        { name: "Image #", value: String(i + 1), inline: true },
        { name: "Reason", value: msg, inline: true },
        { name: "URL", value: studentImageUrls[i].slice(0, 200) },
      ]);
      parts.push(
        `Note: Student image ${i + 1} could not be loaded (${msg}). Evaluate based on available context.`
      );
    }
  }

  return parts;
}

function escapeControlCharsInJsonStrings(raw: string): string {
  let inString = false;
  let escaped = false;
  const chars: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (escaped) {
      chars.push(c);
      escaped = false;
    } else if (c === "\\" && inString) {
      chars.push(c);
      escaped = true;
    } else if (c === '"') {
      chars.push(c);
      inString = !inString;
    } else if (inString && (c === "\n" || c === "\r" || c === "\t")) {
      chars.push(c === "\n" ? "\\n" : c === "\r" ? "\\r" : "\\t");
    } else {
      chars.push(c);
    }
  }
  return chars.join("");
}

const GEMINI_MAX_RETRIES = 3;
const GEMINI_RETRY_BASE_MS = 1000;

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

  let lastError: unknown;
  for (let attempt = 0; attempt < GEMINI_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, GEMINI_RETRY_BASE_MS * 2 ** (attempt - 1)));
    }
    try {
      const result = await model.generateContent(parts);
      const text = result.response.text();
      if (!text) throw new Error("Gemini returned an empty response");

      let parsed: EvaluationResponse;
      try {
        parsed = JSON.parse(text) as EvaluationResponse;
      } catch {
        parsed = JSON.parse(escapeControlCharsInJsonStrings(text)) as EvaluationResponse;
      }

      parsed.score = Math.max(0, Math.min(maxScore, Number(parsed.score) || 0));
      parsed.maxScore = maxScore;
      parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));
      parsed.evaluatedAt = Date.now();

      return parsed;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}

interface BatchEvaluationRequest {
  evaluations: EvaluationRequest[];
}

interface BatchEvaluationResponse {
  results: Record<string, EvaluationResponse>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
        void sendDiscordEmbed("error", "🔴 GEMINI_API_KEY not configured", [
          {
            name: "Impact",
            value: `Batch of ${evaluations.length} subjective answers cannot be evaluated`,
          },
          { name: "Fix", value: "Add GEMINI_API_KEY to Vercel environment variables and redeploy" },
        ]);
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
      }

      void sendDiscordEmbed("info", "📝 Subjective evaluation started", [
        { name: "Questions", value: String(evaluations.length), inline: true },
        { name: "Types", value: evaluations.map((e) => e.questionType).join(", "), inline: true },
        { name: "Model", value: getGeminiModelNameFromEnv(), inline: true },
      ]);

      const results: Record<string, EvaluationResponse> = {};
      const failed: string[] = [];

      for (const evalReq of evaluations) {
        try {
          const parts = await buildRequestParts(evalReq);
          const result = await evaluateWithGemini(parts, evalReq.maxScore);
          results[evalReq.questionId] = result;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[evaluate-subjective] Failed for question ${evalReq.questionId}:`, err);
          failed.push(evalReq.questionId);
          void sendDiscordEmbed("error", "❌ Per-question evaluation failed", [
            { name: "Question ID", value: evalReq.questionId, inline: true },
            { name: "Type", value: evalReq.questionType, inline: true },
            { name: "Max Score", value: String(evalReq.maxScore), inline: true },
            { name: "Error", value: msg },
          ]);
          results[evalReq.questionId] = {
            score: 0,
            maxScore: evalReq.maxScore,
            confidence: 0,
            feedback: "Evaluation failed. This answer will be reviewed manually.",
            evaluatedAt: Date.now(),
          };
        }
      }

      const succeeded = evaluations.length - failed.length;
      const totalAwarded = Object.values(results).reduce((s, r) => s + r.score, 0);
      const totalMax = Object.values(results).reduce((s, r) => s + r.maxScore, 0);
      const avgConfidence =
        succeeded > 0
          ? Object.values(results)
              .filter((r) => r.confidence > 0)
              .reduce((s, r) => s + r.confidence, 0) / succeeded
          : 0;

      void sendDiscordEmbed(
        failed.length > 0 ? "warning" : "success",
        failed.length > 0
          ? `⚠️ Batch done — ${failed.length} failed`
          : "✅ Batch evaluation complete",
        [
          { name: "Evaluated", value: `${succeeded}/${evaluations.length}`, inline: true },
          { name: "Score", value: `${totalAwarded}/${totalMax}`, inline: true },
          { name: "Avg Confidence", value: `${Math.round(avgConfidence * 100)}%`, inline: true },
          ...(failed.length > 0 ? [{ name: "Failed IDs", value: failed.join(", ") }] : []),
        ]
      );

      return res.status(200).json({ results } as BatchEvaluationResponse);
    }

    // Single evaluation
    const evalReq = body as EvaluationRequest;

    if (!evalReq.questionText || !evalReq.studentAnswer) {
      return res.status(400).json({ error: "Missing questionText or studentAnswer" });
    }

    if (!evalReq.questionType) {
      return res.status(400).json({ error: "Missing questionType" });
    }

    if (!process.env.GEMINI_API_KEY) {
      void sendDiscordEmbed("error", "🔴 GEMINI_API_KEY not configured", [
        { name: "Impact", value: "Single subjective answer cannot be evaluated" },
        { name: "Fix", value: "Add GEMINI_API_KEY to Vercel environment variables and redeploy" },
      ]);
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
    }

    const parts = await buildRequestParts(evalReq);
    const result = await evaluateWithGemini(parts, evalReq.maxScore || 5);

    void sendDiscordEmbed("success", "✅ Single evaluation complete", [
      { name: "Question ID", value: evalReq.questionId, inline: true },
      { name: "Score", value: `${result.score}/${result.maxScore}`, inline: true },
      { name: "Confidence", value: `${Math.round(result.confidence * 100)}%`, inline: true },
    ]);

    return res.status(200).json(result);
  } catch (error) {
    console.error("[evaluate-subjective] Unhandled error:", error);
    await notifyDiscord(error, req, "evaluate-subjective");
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}
