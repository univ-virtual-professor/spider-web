const GEMINI_REPAIR_MODEL = "gemini-2.5-flash";

function escapeControlCharsInJsonStrings(raw: string): string {
  let inString = false;
  let escaped = false;
  const chars: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (escaped) {
      chars.push(c);
      escaped = false;
      continue;
    }
    if (c === "\\") {
      escaped = true;
      chars.push(c);
      continue;
    }
    if (c === '"') {
      inString = !inString;
      chars.push(c);
      continue;
    }
    if (inString && (c === "\n" || c === "\r" || c === "\t")) {
      chars.push(c === "\n" ? "\\n" : c === "\r" ? "\\r" : "\\t");
      continue;
    }
    chars.push(c);
  }
  return chars.join("");
}

function stripCodeBlock(text: string): string {
  const match =
    text.match(/```json\s*([\s\S]*?)\s*```/i) ||
    text.match(/```\s*([\s\S]*?)\s*```/i);
  return match ? match[1].trim() : text.trim();
}

async function repairWithGemini(rawText: string, schemaHint?: string): Promise<string> {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON not configured");

  const { VertexAI } = await import("@google-cloud/vertexai");
  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  let sa: any;
  try { sa = JSON.parse(saRaw); } catch { sa = JSON.parse(Buffer.from(saRaw, "base64").toString("utf8")); }
  const vertex = new VertexAI({
    project: sa.project_id,
    location: process.env.VERTEX_LOCATION || "us-central1",
    googleAuthOptions: { credentials: sa },
  });
  const model = vertex.getGenerativeModel({
    model: GEMINI_REPAIR_MODEL,
    generationConfig: { temperature: 0, responseMimeType: "application/json" },
    systemInstruction:
      "You are a JSON repair tool. Return ONLY valid JSON — no markdown, no explanation, no code blocks. Just the raw JSON object.",
  });

  const prompt = schemaHint
    ? `Extract valid JSON matching this schema:\n${schemaHint}\n\nInput:\n${rawText}`
    : `Extract valid JSON from this text:\n\n${rawText}`;

  const result = await model.generateContent(prompt);
  const content = result.response.text().trim();
  if (!content) throw new Error("Gemini repair returned empty response");
  return content;
}

/**
 * Parses a potentially malformed AI JSON response.
 * Cascade: plain parse → escape control chars → strip code block → DeepSeek repair.
 *
 * @param rawText   Raw text from the AI response
 * @param schemaHint  Optional plain-text description of the expected JSON shape (used only when DeepSeek fallback is triggered)
 */
export async function parseAiJson<T>(rawText: string, schemaHint?: string): Promise<T> {
  // 1. Plain parse
  try {
    return JSON.parse(rawText) as T;
  } catch {}

  // 2. Escape control characters inside strings
  try {
    return JSON.parse(escapeControlCharsInJsonStrings(rawText)) as T;
  } catch {}

  // 3. Strip markdown code block wrapper
  const stripped = stripCodeBlock(rawText);
  if (stripped !== rawText.trim()) {
    try {
      return JSON.parse(stripped) as T;
    } catch {}

    try {
      return JSON.parse(escapeControlCharsInJsonStrings(stripped)) as T;
    } catch {}
  }

  // 4. Gemini repair fallback
  const repaired = await repairWithGemini(rawText, schemaHint);
  return JSON.parse(repaired) as T;
}
