import { useEffect, useMemo, useState } from "react";
import { AttemptTable } from "@features/student/components/AttemptTable";
import { Attempt } from "@features/student/types";
import { useAuth } from "@app/providers/AuthProvider";
import { useTenant } from "@app/providers/TenantProvider";
import { db } from "@shared/lib/firebase";
import { collection, onSnapshot, orderBy, query, where, Timestamp } from "firebase/firestore";
import { cn } from "@shared/lib/utils";

type AttemptDoc = {
  testId: string;
  testTitle?: string;
  subject?: string;

  // our backend fields from StudentCBTAttempt.tsx
  status?: "in_progress" | "submitted" | "completed" | "expired" | "in-progress" | "completed";
  createdAt?: Timestamp | { seconds: number } | number | string;
  startedAtMs?: number;
  durationSec?: number;

  score?: number;
  maxScore?: number;
  accuracy?: number; // may be 0-1 OR 0-100 depending on earlier writes
  timeTakenSec?: number;

  rank?: number;
  totalParticipants?: number;

  sectionScores?: { sectionName: string; score: number; maxScore: number }[];
  aiReviewStatus?: "queued" | "in-progress" | "completed" | "failed";
};

function toMillis(v: any): number {
  if (!v) return Date.now();
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : Date.now();
  }
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return Date.now();
}

function normalizeAccuracyPercent(val: any): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  // If stored as 0..1, convert to percentage
  const pct = n <= 1.01 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function mapStatus(
  docStatus: any,
  startedAtMs: number | undefined,
  durationSec: number | undefined
) {
  // AttemptTable expects: 'completed' | 'in-progress' | 'expired'
  const s = String(docStatus || "").toLowerCase();

  const expired = !!startedAtMs && !!durationSec && Date.now() > startedAtMs + durationSec * 1000;

  if (s === "submitted" || s === "completed" || s === "complete") return "completed" as const;
  if (s === "expired") return "expired" as const;

  // in progress variants
  if (expired) return "expired" as const;
  return "in-progress" as const;
}

export default function StudentAttempts() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const { tenant, tenantSlug, loading: tenantLoading } = useTenant();

  const educatorId = tenant?.educatorId || null;

  const [loading, setLoading] = useState(true);
  const [queryError, setQueryError] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [activeTab, setActiveTab] = useState<"test" | "dpp">("test");

  const filteredAttempts = useMemo(() => {
    return attempts.filter((attempt) => {
      const title = attempt.testTitle.toLowerCase();
      const isDpp = title.includes("dpp") || title.includes("practice");
      if (activeTab === "dpp") return isDpp;
      return !isDpp;
    });
  }, [attempts, activeTab]);

  const canLoad = useMemo(() => {
    return !authLoading && !tenantLoading && !!firebaseUser?.uid && !!educatorId;
  }, [authLoading, tenantLoading, firebaseUser, educatorId]);

  useEffect(() => {
    if (!canLoad) {
      setLoading(authLoading || tenantLoading);
      return;
    }

    setLoading(true);
    setQueryError(false);

    const q = query(
      collection(db, "attempts"),
      where("studentId", "==", firebaseUser!.uid),
      where("educatorId", "==", educatorId),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: Attempt[] = snap.docs.map((d) => {
          const data = d.data() as AttemptDoc;

          const createdAtMs = toMillis(data.createdAt);
          const startedAtMs = typeof data.startedAtMs === "number" ? data.startedAtMs : undefined;
          const durationSec = typeof data.durationSec === "number" ? data.durationSec : undefined;

          const status = mapStatus(data.status, startedAtMs, durationSec);

          return {
            id: d.id,
            testId: String(data.testId || ""),
            testTitle: String(data.testTitle || "Untitled Test"),
            subject: String(data.subject || "General"),

            score: Number(data.score ?? 0),
            maxScore: Number(data.maxScore ?? 0),

            accuracy: normalizeAccuracyPercent(data.accuracy),

            // AttemptTable expects seconds
            timeSpent: Number(data.timeTakenSec ?? 0),

            // Ranking not implemented yet — keep as 0 so UI shows "—"
            rank: Number(data.rank ?? 0),
            totalParticipants: Number(data.totalParticipants ?? 0),

            status,

            createdAt: new Date(createdAtMs).toISOString(),
            completedAt: status === "completed" ? new Date(createdAtMs).toISOString() : undefined,

            sectionScores: Array.isArray(data.sectionScores) ? data.sectionScores : [],
            aiReviewStatus: data.aiReviewStatus ?? "queued",
          };
        });

        setAttempts(rows);
        setLoading(false);
      },
      (err) => {
        console.error("[StudentAttempts] Firestore query failed:", err);
        setQueryError(true);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [canLoad, firebaseUser, educatorId, authLoading, tenantLoading, tenantSlug]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">My Attempts</h1>
          <p className="text-muted-foreground">Review all your test attempts and performance</p>
        </div>
        <div className="rounded-xl border border-border p-6 text-muted-foreground">
          Loading attempts…
        </div>
      </div>
    );
  }

  if (queryError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">My Attempts</h1>
          <p className="text-muted-foreground">Review all your test attempts and performance</p>
        </div>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="font-medium text-destructive">Failed to load attempts</p>
          <p className="mt-1 text-sm text-muted-foreground">
            There was a problem connecting to the database. Please refresh the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Attempts</h1>
          <p className="text-muted-foreground">Review all your test attempts and performance</p>
        </div>

        <div className="inline-flex shrink-0 rounded-lg border border-border/50 bg-muted/30 p-1">
          <button
            onClick={() => setActiveTab("test")}
            className={cn(
              "rounded-md px-4 py-1.5 text-xs font-medium transition-all duration-200",
              activeTab === "test"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Tests
          </button>
          <button
            onClick={() => setActiveTab("dpp")}
            className={cn(
              "rounded-md px-4 py-1.5 text-xs font-medium transition-all duration-200",
              activeTab === "dpp"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            DPPs
          </button>
        </div>
      </div>

      {attempts.length === 0 ? (
        <div className="rounded-xl border border-border p-6 text-muted-foreground">
          No attempts found yet. Start a test to see your attempts here.
        </div>
      ) : filteredAttempts.length === 0 ? (
        <div className="rounded-xl border border-border p-6 text-muted-foreground">
          No {activeTab === "dpp" ? "DPP" : "Test"} attempts found.
        </div>
      ) : (
        <AttemptTable attempts={filteredAttempts} />
      )}
    </div>
  );
}
