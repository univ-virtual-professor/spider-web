// src/hooks/useFavicon.ts
import { useEffect } from "react";

/**
 * Dynamically sets the browser favicon and page <title> for an educator's
 * subdomain website.
 *
 * - If the educator has uploaded a logo, use it as the favicon.
 * - Otherwise, fall back to the default /logo.png.
 */
export function useFavicon(logoUrl?: string | null, coachingName?: string | null) {
  useEffect(() => {
    // --- Favicon ---
    const faviconUrl = logoUrl?.trim() || "/logo-compact.png";

    // Remove all existing favicon links and insert a fresh one so the browser
    // actually re-fetches the icon instead of serving the cached platform logo.
    document.querySelectorAll("link[rel~='icon']").forEach((el) => el.remove());
    const link = document.createElement("link");
    link.rel = "icon";
    link.type = faviconUrl.endsWith(".svg") ? "image/svg+xml" : "image/png";
    link.href = faviconUrl;
    document.head.appendChild(link);

    // --- Page title ---
    if (coachingName?.trim()) {
      document.title = `${coachingName.trim()} | Powered by PREPAREKARO.IN`;
    }

    // Restore defaults when the component unmounts (navigating away from tenant page)
    return () => {
      document.querySelectorAll("link[rel~='icon']").forEach((el) => el.remove());
      const restore = document.createElement("link");
      restore.rel = "icon";
      restore.type = "image/png";
      restore.href = "/logo-compact.png";
      document.head.appendChild(restore);
    };
  }, [logoUrl, coachingName]);
}
