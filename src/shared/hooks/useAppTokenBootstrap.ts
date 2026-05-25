import { useEffect, useRef, useState } from "react";
import { signInWithCustomToken, onAuthStateChanged } from "firebase/auth";
import { auth } from "@shared/lib/firebase";

type Status = "idle" | "exchanging" | "done" | "error";

/**
 * Called once on WebView-wrapped pages (_app=1).
 * Reads ?__authToken=<Firebase ID token> from the URL, exchanges it for a
 * custom token via /api/auth/exchange-token, signs in Firebase on the web side,
 * then waits for onAuthStateChanged to confirm the user before returning isReady.
 */
export function useAppTokenBootstrap() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;

    const params = new URLSearchParams(window.location.search);
    const idToken = params.get("__authToken");
    if (!idToken) {
      setStatus("done");
      return;
    }

    attempted.current = true;
    setStatus("exchanging");

    // Strip the token from the URL immediately so it isn't bookmarked / logged.
    params.delete("__authToken");
    const newSearch = params.toString();
    const cleanUrl =
      window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
    window.history.replaceState(null, "", cleanUrl);

    (async () => {
      try {
        const res = await fetch("/api/auth/exchange-token", {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(body?.error || `HTTP ${res.status}`);
        }

        const { customToken } = await res.json();
        await signInWithCustomToken(auth, customToken);

        // Wait for onAuthStateChanged to confirm the user is set before signalling ready.
        // This closes the gap between signInWithCustomToken resolving and the auth
        // state propagating to route guards.
        await new Promise<void>((resolve) => {
          const unsub = onAuthStateChanged(auth, (user) => {
            if (user) {
              unsub();
              resolve();
            }
          });
        });

        setStatus("done");
      } catch (e: any) {
        const msg = String(e?.message || e);
        console.error("[useAppTokenBootstrap] ❌", msg);
        setError(msg);
        setStatus("error");
      }
    })();
  }, []);

  return { status, error, isReady: status === "done" || status === "error" };
}
