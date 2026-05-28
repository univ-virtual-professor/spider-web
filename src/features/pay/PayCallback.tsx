import { useEffect, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { buildTenantUrl } from "@shared/lib/tenant";

export default function PayCallback() {
  const [phase, setPhase] = useState<"loading" | "redirecting">("loading");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const educatorSlug = params.get("educator_slug") || "";
    const orderId = params.get("order_id") || "";

    // Brief display, then bounce to educator billing for auth-gated verification
    const timer = setTimeout(() => {
      setPhase("redirecting");

      const base = educatorSlug
        ? buildTenantUrl(educatorSlug, "/educator/billing")
        : "/educator/billing";

      const redirectUrl = new URL(base, window.location.href);
      redirectUrl.searchParams.set("payment", "success");
      if (orderId) redirectUrl.searchParams.set("order_id", orderId);

      window.location.href = redirectUrl.toString();
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
      {phase === "loading" ? (
        <>
          <Loader2 className="mb-4 h-12 w-12 animate-spin text-primary" />
          <h1 className="text-xl font-semibold">Processing your payment…</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Please wait while we confirm your transaction.
          </p>
        </>
      ) : (
        <>
          <CheckCircle2 className="mb-4 h-12 w-12 text-green-500" />
          <h1 className="text-xl font-semibold">Payment received</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Redirecting you back to your dashboard…
          </p>
        </>
      )}
    </div>
  );
}
