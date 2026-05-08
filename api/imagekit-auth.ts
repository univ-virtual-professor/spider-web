// api/imagekit-auth.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { notifyDiscord } from "./_lib/discordLogger.js";

// Wrap everything in try-catch at module level to prevent unhandled errors
let ImageKitModule: any = null;
let imagekitInstance: any = null;

async function getImageKitInstance() {
  try {
    if (!ImageKitModule) {
      ImageKitModule = await import("imagekit");
    }
    
    if (!imagekitInstance) {
      const publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
      const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
      const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;
      
      if (!publicKey || !privateKey || !urlEndpoint) {
        throw new Error(`ImageKit vars missing: pub=${!!publicKey}, priv=${!!privateKey}, url=${!!urlEndpoint}`);
      }
      
      const ImageKit = ImageKitModule.default || ImageKitModule;
      imagekitInstance = new ImageKit({ publicKey, privateKey, urlEndpoint });
    }
    
    return imagekitInstance;
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error("[imagekit-auth] Failed to initialize ImageKit:", msg);
    throw new Error(msg);
  }
}

let requireUserModule: any = null;

async function getRequireUser() {
  try {
    if (!requireUserModule) {
      const imported = await import("./_lib/requireUser.js");
      requireUserModule = imported.requireUser;
    }
    return requireUserModule;
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error("[imagekit-auth] Failed to import requireUser:", msg);
    throw new Error(msg);
  }
}

function sanitizeDomain(rawDomain: string): string {
  return String(rawDomain || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/^\.+|\.+$/g, "")
    .replace(/^www\./, "");
}

function getAllowedDomainSuffixes(): string[] {
  const fromCorsSuffixes = String(process.env.CORS_ALLOW_DOMAIN_SUFFIXES || "")
    .split(",")
    .map((x) => sanitizeDomain(x))
    .filter(Boolean);

  const fromAppDomains = String(
    process.env.VITE_APP_DOMAINS || process.env.VITE_APP_DOMAIN || process.env.VITE_APP_BASE_DOMAIN || ""
  )
    .split(",")
    .map((x) => sanitizeDomain(x))
    .filter(Boolean);

  const fallback = ["univ.live"];

  const unique: string[] = [];
  for (const domain of [...fromCorsSuffixes, ...fromAppDomains, ...fallback]) {
    if (!unique.includes(domain)) unique.push(domain);
  }

  return unique;
}

function isOriginAllowedByDomainSuffix(origin: string): boolean {
  let host = "";
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }

  if (!host) return false;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost")) return true;

  return getAllowedDomainSuffixes().some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function setCors(req: VercelRequest, res: VercelResponse) {
  try {
    const origin = String(req.headers.origin || "");
    if (!origin) return;

    const allow = new Set(
      String(process.env.CORS_ALLOW_ORIGINS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );

    const isAllowed = allow.has(origin) || isOriginAllowedByDomainSuffix(origin);

    if (isAllowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
  } catch (e) {
    console.error("[imagekit-auth] CORS error:", e);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CRITICAL: Set JSON response type FIRST, BEFORE anything else
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  
  try {
    setCors(req, res);

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
    
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const scope = String((req.query?.scope as string) || "question-bank").toLowerCase();
    const method = req.method;

    // Get requireUser function
    const requireUser = await getRequireUser();

    // Authenticate user
    let user;
    try {
      if (scope === "website" || scope === "content") {
        user = await requireUser(req, { roles: ["ADMIN", "EDUCATOR"] });
      } else if (scope === "student") {
        user = await requireUser(req, { roles: ["ADMIN", "EDUCATOR", "STUDENT"] });
      } else {
        user = await requireUser(req, { roles: ["ADMIN"] });
      }
    } catch (authErr: any) {
      const authMsg = String(authErr?.message || "Auth failed");
      console.error(`[imagekit-auth] ❌ Auth error:`, authMsg);
      
      if (authMsg.includes("Missing Authorization token")) {
        return res.status(401).json({ error: "Missing Authorization token" });
      }
      if (authMsg.includes("Forbidden")) {
        return res.status(403).json({ error: "Forbidden for scope: " + scope });
      }
      return res.status(401).json({ error: authMsg });
    }

    // Get ImageKit instance
    const imageKit = await getImageKitInstance();

    // Generate auth params
    let authParams;
    try {
      authParams = imageKit.getAuthenticationParameters();

      // Always return the public key so the client never needs VITE_IMAGEKIT_PUBLIC_KEY
      const publicKey = process.env.IMAGEKIT_PUBLIC_KEY ?? "";

      if (scope === "content") {
        const role = user?.role || "EDUCATOR";
        const maxFileSizeMB =
          role === "ADMIN"
            ? parseInt(process.env.ADMIN_MAX_FILE_SIZE_MB || "100", 10)
            : parseInt(process.env.EDUCATOR_MAX_FILE_SIZE_MB || "20", 10);
        return res.status(200).json({ ...authParams, publicKey, maxFileSizeMB });
      }

      return res.status(200).json({ ...authParams, publicKey });
    } catch (paramErr: any) {
      const paramMsg = String(paramErr?.message || "Failed to generate params");
      console.error(`[imagekit-auth] ❌ Param error:`, paramMsg);
      return res.status(500).json({ error: paramMsg });
    }
    
  } catch (e: any) {
    // Final safety net - ALWAYS return JSON
    const msg = String(e?.message || String(e) || "Unknown error");
    console.error("[imagekit-auth] 🔴 UNHANDLED ERROR:", msg, e);
    await notifyDiscord(e, req, "imagekit-auth");

    try {
      return res.status(500).json({ error: msg });
    } catch {
      // If even this fails, send plain text as last resort
      res.status(500);
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
}
