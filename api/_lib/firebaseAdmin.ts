import admin from "firebase-admin";

let inited = false;

type ServiceAccountLike = {
  project_id?: string;
  private_key?: string;
  client_email?: string;
  [key: string]: unknown;
};

function normalizeJsonTypography(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function extractLikelyJsonObject(value: string): string {
  const first = value.indexOf("{");
  const last = value.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return value.slice(first, last + 1);
  }
  return value;
}

function stripOuterQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalizePrivateKeyNewlines(jsonText: string): string {
  return jsonText.replace(
    /(\"private_key\"\s*:\s*\")([\s\S]*?)(\"\s*,\s*\"client_email\")/,
    (_full, start, keyBody, end) => `${start}${String(keyBody).replace(/\r?\n/g, "\\n")}${end}`
  );
}

function parseServiceAccountJson(raw: string): ServiceAccountLike {
  const base = normalizeJsonTypography(raw).trim();
  const extracted = extractLikelyJsonObject(base).trim();
  const candidates = Array.from(
    new Set(
      [
        base,
        extracted,
        stripOuterQuotes(base),
        stripOuterQuotes(extracted),
        base.replace(/\\"/g, '"'),
        extracted.replace(/\\"/g, '"'),
        stripOuterQuotes(base).replace(/\\"/g, '"'),
        stripOuterQuotes(extracted).replace(/\\"/g, '"'),
        normalizePrivateKeyNewlines(base),
        normalizePrivateKeyNewlines(stripOuterQuotes(base)),
        normalizePrivateKeyNewlines(extracted),
        normalizePrivateKeyNewlines(stripOuterQuotes(extracted)),
      ].filter(Boolean)
    )
  );

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") {
        return parsed as ServiceAccountLike;
      }

      if (typeof parsed === "string") {
        const nested = JSON.parse(parsed);
        if (nested && typeof nested === "object") {
          return nested as ServiceAccountLike;
        }
      }
    } catch (err) {
      lastError = err;
    }
  }

  const lastMsg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON: ${lastMsg}`);
}

function loadServiceAccountFromEnv(): ServiceAccountLike {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const rawBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;

  if (!rawJson && !rawBase64) {
    throw new Error(
      "Missing Firebase service account env var. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_JSON_BASE64"
    );
  }

  const parseErrors: string[] = [];

  function normalizeResult(sa: ServiceAccountLike): ServiceAccountLike {
    if (typeof sa.private_key === "string") {
      sa.private_key = sa.private_key.replace(/\\n/g, "\n");
    }
    return sa;
  }

  // Prefer base64 when present because hosting dashboards often corrupt raw JSON formatting.
  if (rawBase64) {
    try {
      const normalized = rawBase64.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
      const padLength = (4 - (normalized.length % 4)) % 4;
      const padded = `${normalized}${"=".repeat(padLength)}`;
      const decoded = Buffer.from(padded, "base64").toString("utf8");
      return normalizeResult(parseServiceAccountJson(decoded));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      parseErrors.push(`FIREBASE_SERVICE_ACCOUNT_JSON_BASE64: ${msg}`);
    }
  }

  if (rawJson) {
    try {
      return normalizeResult(parseServiceAccountJson(rawJson));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      parseErrors.push(`FIREBASE_SERVICE_ACCOUNT_JSON: ${msg}`);
    }
  }

  throw new Error(`Unable to parse Firebase service account. ${parseErrors.join(" | ")}`);
}

export function getAdmin() {
  if (!inited) {
    try {
      const serviceAccount = loadServiceAccountFromEnv();

      if (!serviceAccount.project_id) {
        throw new Error("Service account JSON missing project_id field");
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined,
      });

      inited = true;
    } catch (e: any) {
      console.error("[firebaseAdmin] ❌ Initialization failed:", e?.message || String(e));
      throw e;
    }
  }
  return admin;
}
