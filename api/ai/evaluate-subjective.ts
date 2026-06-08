import { VercelRequest, VercelResponse } from "@vercel/node";
import { VertexAI, SchemaType, type GenerationConfig } from "@google-cloud/vertexai";
import { getGeminiModelNameFromEnv } from "../_lib/geminiModel.js";
import { notifyDiscord, sendDiscordEmbed } from "../_lib/discordLogger.js";
import { parseAiJson } from "../_lib/parseAiJson.js";

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
  "You are a strict academic examiner. Your job is to award marks only for what is clearly correct.",
  "When in doubt, do NOT award the mark. Err on the side of strictness, not leniency.",
  "",
  "SCORING APPROACH — start from 0, justify every mark you award:",
  "- Do not start from full marks and deduct. Start from 0 and add only for confirmed correct content.",
  "- Every mark awarded must correspond to something explicitly and correctly present in the student's answer.",
  "- Never give benefit of the doubt. If something is unclear, ambiguous, or partially legible, do not award marks for it.",
  "",
  "SECTION COMPLETENESS:",
  "- Identify every distinct section or part in the reference answer.",
  "- If the student's answer is missing a section entirely, award 0 for that section — no exceptions.",
  "- Strong performance in one section does not compensate for a missing or wrong section.",
  "",
  "NUMERICAL ACCURACY (mandatory check before scoring):",
  "- Read every number in the student's answer. Compare each against the reference answer one by one.",
  "- A wrong numerical value = 0 marks for that specific value, even if the surrounding method is correct.",
  "- No rounding, no approximations — exact match required for numerical credit.",
  "",
  "CONTENT ACCURACY:",
  "- Each factual claim, formula, step, or entry must match the reference answer to earn marks.",
  "- Vague, incomplete, or partially correct statements earn 0 unless partial credit is clearly warranted",
  "  by distinct correct sub-parts (e.g., correct method but wrong final answer).",
  "- Keywords must be present and used correctly in context, not just mentioned.",
  "",
  "For uploaded image answers, read the handwritten content carefully before evaluating.",
  "If a reference answer image is provided, use it as the authoritative marking guide.",
  "",
  "Response fields:",
  "- score: Marks awarded (0 to maxScore). Must reflect strict evaluation — not a rounded-up estimate.",
  "- maxScore: Same as input.",
  "- confidence: 0.0–1.0. Use 0.3–0.5 when handwriting is unclear or answer is ambiguous.",
  "- feedback: 2-3 short sentences. List what was correct, what was wrong/missing, and any numerical mismatches. Be concise.",
  "- keywordMatches: Keywords from the expected list that were correctly used in the student's answer.",
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
    if (!hasStudentImages) {
      void sendDiscordEmbed("warning", "⚠️ UPLOAD question has no student images", [
        { name: "Question ID", value: req.questionId, inline: true },
        { name: "studentAnswer", value: (req.studentAnswer || "(empty)").slice(0, 200) },
      ]);
    }
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
      void sendDiscordEmbed("warning", "⚠️ Reference image could not be loaded", [
        { name: "Question ID", value: req.questionId, inline: true },
        { name: "Image #", value: String(i + 1), inline: true },
        { name: "Reason", value: msg, inline: true },
        { name: "URL", value: referenceImageUrls[i].slice(0, 200) },
      ]);
      parts.push(
        `Note: Reference image ${i + 1} could not be loaded (${msg}). Evaluate based on available text.`
      );
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

const GEMINI_MAX_RETRIES = 3;
const GEMINI_RETRY_BASE_MS = 1000;

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "";
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  }
}

async function evaluateWithGemini(
  parts: any[],
  maxScore: number
): Promise<{
  result: EvaluationResponse;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
}> {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
  }

  const sa = parseServiceAccount();
  const vertex = new VertexAI({
    project: sa.project_id,
    location: process.env.VERTEX_LOCATION || "us-central1",
    googleAuthOptions: { credentials: sa },
  });

  const generationConfig: GenerationConfig = {
    temperature: 0.3,
    maxOutputTokens: 1024,
    responseMimeType: "application/json",
    responseSchema: evaluationSchema as any,
    // Disable thinking — structured rubric in system prompt makes it unnecessary,
    // and thinking tokens cost $3.50/M vs $0.60/M for output on Gemini 2.5 Flash.
    thinkingConfig: { thinkingBudget: 0 },
  } as any;

  const model = vertex.getGenerativeModel({
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
      const normalizedParts = parts.map((p: any) => (typeof p === "string" ? { text: p } : p));
      const result = await model.generateContent({
        contents: [{ role: "user", parts: normalizedParts }],
      });
      const candidate = result.response.candidates?.[0];
      if (candidate?.finishReason === "MAX_TOKENS") {
        void sendDiscordEmbed("warning", "⚠️ Gemini hit MAX_TOKENS — feedback may be truncated", [
          { name: "Attempt", value: String(attempt + 1), inline: true },
        ]);
        throw new Error("Gemini response truncated by MAX_TOKENS");
      }
      const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (!text) throw new Error("Gemini returned an empty response");
      const inputTokens = result.response.usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = result.response.usageMetadata?.candidatesTokenCount ?? 0;
      const thinkingTokens = (result.response.usageMetadata as any)?.thoughtsTokenCount ?? 0;
      const tokensUsed: number = inputTokens + outputTokens + thinkingTokens;

      let parsed: EvaluationResponse;
      try {
        parsed = await parseAiJson<EvaluationResponse>(text);
      } catch (parseErr) {
        const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        void sendDiscordEmbed(
          "warning",
          `⚠️ Gemini JSON parse failed (attempt ${attempt + 1}/${GEMINI_MAX_RETRIES})`,
          [
            { name: "Parse Error", value: parseMsg },
            { name: "Raw Response", value: text.slice(0, 800) },
          ]
        );
        throw parseErr;
      }

      parsed.score = Math.max(0, Math.min(maxScore, Number(parsed.score) || 0));
      parsed.maxScore = maxScore;
      parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));
      parsed.evaluatedAt = Date.now();

      return { result: parsed, tokens: tokensUsed, inputTokens, outputTokens, thinkingTokens };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < GEMINI_MAX_RETRIES - 1) {
        void sendDiscordEmbed("warning", `🔁 Gemini retry ${attempt + 2}/${GEMINI_MAX_RETRIES}`, [
          { name: "Failed Attempt", value: String(attempt + 1), inline: true },
          { name: "Error", value: msg },
        ]);
      }
      lastError = err;
    }
  }

  throw lastError;
}

async function reportAiUsage(tokens: number, idToken: string | undefined): Promise<void> {
  if (!tokens || !idToken || !process.env.VITE_MONKEY_KING_API_URL) return;
  try {
    await fetch(`${process.env.VITE_MONKEY_KING_API_URL}/api/ai/report-usage`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ feature: "subjEval", tokens }),
    });
  } catch {
    // Non-blocking — eval result still returned
  }
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

      if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        void sendDiscordEmbed("error", "🔴 FIREBASE_SERVICE_ACCOUNT_JSON not configured", [
          {
            name: "Impact",
            value: `Batch of ${evaluations.length} subjective answers cannot be evaluated`,
          },
          {
            name: "Fix",
            value: "Add FIREBASE_SERVICE_ACCOUNT_JSON to Vercel environment variables and redeploy",
          },
        ]);
        return res.status(500).json({ error: "FIREBASE_SERVICE_ACCOUNT_JSON is not configured" });
      }

      void sendDiscordEmbed("info", "📝 Subjective evaluation started", [
        { name: "Questions", value: String(evaluations.length), inline: true },
        { name: "Types", value: evaluations.map((e) => e.questionType).join(", "), inline: true },
        { name: "Model", value: getGeminiModelNameFromEnv(), inline: true },
      ]);

      const results: Record<string, EvaluationResponse> = {};
      const failed: string[] = [];
      let batchTokens = 0;
      let batchInputTokens = 0;
      let batchOutputTokens = 0;
      let batchThinkingTokens = 0;

      for (const evalReq of evaluations) {
        try {
          const parts = await buildRequestParts(evalReq);
          const {
            result,
            tokens,
            inputTokens: inTok,
            outputTokens: outTok,
            thinkingTokens: thinkTok,
          } = await evaluateWithGemini(parts, evalReq.maxScore);
          batchTokens += tokens;
          batchInputTokens += inTok;
          batchOutputTokens += outTok;
          batchThinkingTokens += thinkTok;
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
          {
            name: "Tokens",
            value: `${batchInputTokens.toLocaleString()} in / ${batchOutputTokens.toLocaleString()} out / ${batchThinkingTokens.toLocaleString()} think`,
            inline: true,
          },
          {
            name: "Est. Cost",
            // Gemini 2.5 Flash: $0.15/M input, $0.60/M output, $3.50/M thinking @ 95 ₹/USD
            value: `₹${(batchInputTokens * 0.00001425 + batchOutputTokens * 0.000057 + batchThinkingTokens * 0.0003325).toFixed(4)}`,
            inline: true,
          },
          ...(failed.length > 0 ? [{ name: "Failed IDs", value: failed.join(", ") }] : []),
        ]
      );

      void reportAiUsage(batchTokens, req.headers["authorization"]?.replace("Bearer ", ""));

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

    if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      void sendDiscordEmbed("error", "🔴 FIREBASE_SERVICE_ACCOUNT_JSON not configured", [
        { name: "Impact", value: "Single subjective answer cannot be evaluated" },
        {
          name: "Fix",
          value: "Add FIREBASE_SERVICE_ACCOUNT_JSON to Vercel environment variables and redeploy",
        },
      ]);
      return res.status(500).json({ error: "FIREBASE_SERVICE_ACCOUNT_JSON is not configured" });
    }

    const parts = await buildRequestParts(evalReq);
    const { result, tokens, inputTokens, outputTokens, thinkingTokens } = await evaluateWithGemini(
      parts,
      evalReq.maxScore || 5
    );

    void reportAiUsage(tokens, req.headers["authorization"]?.replace("Bearer ", ""));

    void sendDiscordEmbed("success", "✅ Single evaluation complete", [
      { name: "Question ID", value: evalReq.questionId, inline: true },
      { name: "Score", value: `${result.score}/${result.maxScore}`, inline: true },
      { name: "Confidence", value: `${Math.round(result.confidence * 100)}%`, inline: true },
      {
        name: "Tokens",
        value: `${inputTokens} in / ${outputTokens} out / ${thinkingTokens} think`,
        inline: true,
      },
      {
        name: "Est. Cost",
        // Gemini 2.5 Flash: $0.15/M input, $0.60/M output, $3.50/M thinking @ 95 ₹/USD
        value: `₹${(inputTokens * 0.00001425 + outputTokens * 0.000057 + thinkingTokens * 0.0003325).toFixed(4)}`,
        inline: true,
      },
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
