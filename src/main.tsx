import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { logError } from "@shared/lib/errorLogger";
import ErrorBoundary from "@shared/lib/ErrorBoundary";

window.addEventListener("error", (e) => {
  // Cross-origin scripts (e.g. Cashfree SDK) produce "Script error." with no detail — skip
  if (!e.error && e.message === "Script error.") return;
  logError(e.error ?? e.message, `uncaught: ${e.filename}:${e.lineno}`);
});

window.addEventListener("unhandledrejection", (e) => {
  logError(e.reason, "unhandledrejection");
});

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </HelmetProvider>
);
