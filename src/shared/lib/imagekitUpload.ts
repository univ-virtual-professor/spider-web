// src/lib/imagekitUpload.ts
import { auth } from "@shared/lib/firebase";

export type ImageKitScope = "question-bank" | "website" | "content" | "student";

type ImageKitAuthParams = {
  token: string;
  expire: number;
  signature: string;
  publicKey?: string;
};

function getIdToken(forceRefresh: boolean = false): Promise<string> {
  return new Promise((resolve, reject) => {
    // onAuthStateChanged ensures we wait for Firebase to initialize on app launch
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      unsubscribe(); // Prevent memory leaks and duplicate calls

      if (!user) {
        console.error("[getIdToken] User not logged in");
        return reject(new Error("Not logged in - please sign in first"));
      }

      try {
        // Defaults to cached token unless forceRefresh is explicitly true
        const token = await user.getIdToken(forceRefresh);
        resolve(token);
      } catch (e: any) {
        console.error("[getIdToken] Failed to get token:", e?.message);
        reject(new Error(`Failed to get auth token: ${e?.message}`));
      }
    });
  });
}

export async function getContentUploadLimit(): Promise<number> {
  const idToken = await getIdToken();
  const res = await fetch("/api/imagekit-auth?scope=content", {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) return 20;
  const data = await res.json();
  return typeof data.maxFileSizeMB === "number" ? data.maxFileSizeMB : 20;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1000): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const isNetworkError =
        err instanceof TypeError && err.message.toLowerCase().includes("fetch");
      if (!isNetworkError || attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw lastErr;
}

export async function uploadToImageKit(
  file: Blob,
  fileName: string,
  folder = "/question-bank",
  scope: ImageKitScope = "question-bank"
) {
  const idToken = await getIdToken();

  async function fetchAuthParams(authScope: ImageKitScope): Promise<ImageKitAuthParams> {
    const url = `/api/imagekit-auth?scope=${encodeURIComponent(authScope)}`;

    const authRes = await withRetry(() =>
      fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${idToken}` },
      })
    );

    const rawText = await authRes.text();

    if (!authRes.ok) {
      let parsedError = rawText;
      try {
        const json = JSON.parse(rawText);
        parsedError = String(json?.error || rawText);
      } catch {
        // Keep raw response text when it is not JSON.
      }

      const shortError =
        parsedError.length > 250 ? `${parsedError.substring(0, 250)}...` : parsedError;
      throw new Error(`ImageKit auth failed (${authScope}) [${authRes.status}]: ${shortError}`);
    }
    let parsed: ImageKitAuthParams;
    try {
      parsed = JSON.parse(rawText) as ImageKitAuthParams;
    } catch (parseErr: any) {
      const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      throw new Error(`Invalid auth response format (${authScope}): ${parseMsg}`);
    }

    if (!parsed?.token || !parsed?.signature || typeof parsed?.expire !== "number") {
      throw new Error(`Invalid auth payload (${authScope}): missing token/signature/expire`);
    }
    return parsed;
  }

  let authParams: ImageKitAuthParams;
  try {
    authParams = await fetchAuthParams(scope);
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    const is403 = msg.includes("[403]") || msg.toLowerCase().includes("forbidden");
    const shouldFallback = is403 && (scope === "question-bank" || scope === "content");

    if (!shouldFallback) {
      throw err;
    }

    // "content" scope not yet deployed on server — fall back to "website" which
    // already allows EDUCATOR + ADMIN and is live.
    console.warn(`[uploadToImageKit] ${scope} scope forbidden; retrying with website scope`);
    authParams = await fetchAuthParams("website");
  }

  const { token, expire, signature } = authParams;
  const publicKey =
    (authParams as any).publicKey || (import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY as string);
  if (!publicKey)
    throw new Error("ImageKit public key not found — set VITE_IMAGEKIT_PUBLIC_KEY in .env");

  const form = new FormData();
  form.append("file", file);
  form.append("fileName", fileName);
  form.append("publicKey", publicKey);
  form.append("signature", signature);
  form.append("expire", String(expire));
  form.append("token", token);
  form.append("folder", folder);
  form.append("useUniqueFileName", "true");

  const uploadRes = await withRetry(() =>
    fetch("https://upload.imagekit.io/api/v1/files/upload", {
      method: "POST",
      body: form,
    })
  );

  if (!uploadRes.ok) {
    const txt = await uploadRes.text().catch(() => "");
    console.error(`[uploadToImageKit] Upload failed (${uploadRes.status}):`, txt.substring(0, 300));
    throw new Error(`ImageKit upload failed: ${uploadRes.status}`);
  }

  const json = await uploadRes.json();

  return {
    url: json.url as string,
    fileId: json.fileId as string,
    name: json.name as string,
  };
}
