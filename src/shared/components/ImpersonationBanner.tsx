import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { impAuth } from "@shared/lib/firebase-impersonation";

export default function ImpersonationBanner() {
  const [session, setSession] = useState<{ name: string; uid: string } | null>(() => {
    const raw = sessionStorage.getItem("imp_session");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const handler = () => {
      const raw = sessionStorage.getItem("imp_session");
      if (!raw) {
        setSession(null);
        return;
      }
      try {
        setSession(JSON.parse(raw));
      } catch {
        setSession(null);
      }
    };
    window.addEventListener("imp_session_changed", handler);
    return () => window.removeEventListener("imp_session_changed", handler);
  }, []);

  if (!session) return null;

  function returnToAdmin() {
    sessionStorage.removeItem("imp_session");
    signOut(impAuth).catch(() => {});
    window.dispatchEvent(new Event("imp_session_changed"));
    if (window.opener && !window.opener.closed) {
      try {
        window.opener.focus();
      } catch {
        /* noop */
      }
    }
    setTimeout(() => {
      window.location.href = "/admin/educators";
    }, 300);
    window.close();
  }

  return (
    <div className="flex w-full shrink-0 items-center justify-between bg-amber-400 px-4 py-2 text-sm font-medium text-amber-950">
      <span>
        Admin Mode — Viewing as <strong>{session.name}</strong>
      </span>
      <button onClick={returnToAdmin} className="text-amber-900 underline">
        Return to Admin Dashboard
      </button>
    </div>
  );
}
