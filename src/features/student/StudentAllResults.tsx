import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { toast } from "sonner";
import { Skeleton } from "@shared/ui/skeleton";
import { cn } from "@shared/lib/utils";
import { useAuth } from "@app/providers/AuthProvider";
import { useTenant } from "@app/providers/TenantProvider";
import { db } from "@shared/lib/firebase";
import { listMyAnswerSheets, type AnswerSheet } from "./examResults/api";
import { DsPageHeader, DsCard, DsStatusPill } from "@shared/ui/ds";

type PillTone = "accent" | "info" | "positive" | "slate" | "neutral";

// ── helpers ─────────────────────────────────────────────────────────────────

function toMillis(v: any): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return 0;
}

const SHEET_STATUS_TONE: Record<string, PillTone> = {
  uploaded: "slate",
  pending: "info",
  processing: "info",
  graded: "positive",
  approved: "positive",
  failed: "accent",
};

type Tab = "online" | "paper";

// ── component ────────────────────────────────────────────────────────────────

export default function StudentAllResults() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "paper" ? "paper" : "online";

  const { firebaseUser, loading: authLoading } = useAuth();
  const { tenant, loading: tenantLoading } = useTenant();
  const educatorId = tenant?.educatorId ?? null;

  // ── Online (Firestore) ───────────────────────────────────────────────────

  type OnlineAttempt = {
    id: string;
    testTitle: string;
    subject: string;
    score: number;
    maxScore: number;
    status: string;
    createdAtMs: number;
  };

  const [onlineLoading, setOnlineLoading] = useState(true);
  const [onlineAttempts, setOnlineAttempts] = useState<OnlineAttempt[]>([]);

  useEffect(() => {
    if (authLoading || tenantLoading || !firebaseUser?.uid || !educatorId) {
      setOnlineLoading(authLoading || tenantLoading);
      return;
    }
    setOnlineLoading(true);
    const q = query(
      collection(db, "attempts"),
      where("studentId", "==", firebaseUser.uid),
      where("educatorId", "==", educatorId),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setOnlineAttempts(
          snap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              testTitle: String(data.testTitle || "Untitled Test"),
              subject: String(data.subject || ""),
              score: Number(data.score ?? 0),
              maxScore: Number(data.maxScore ?? 0),
              status: String(data.status || "in-progress"),
              createdAtMs: toMillis(data.createdAt),
            };
          })
        );
        setOnlineLoading(false);
      },
      () => setOnlineLoading(false)
    );
    return () => unsub();
  }, [authLoading, tenantLoading, firebaseUser?.uid, educatorId]);

  // ── Paper (grade-engine) ─────────────────────────────────────────────────

  const [paperLoading, setPaperLoading] = useState(true);
  const [sheets, setSheets] = useState<AnswerSheet[]>([]);

  useEffect(() => {
    if (!firebaseUser) return;
    setPaperLoading(true);
    firebaseUser
      .getIdToken()
      .then((token) => listMyAnswerSheets(token))
      .then(setSheets)
      .catch((e) => toast.error(e.message))
      .finally(() => setPaperLoading(false));
  }, [firebaseUser]);

  // ── Tab switch ────────────────────────────────────────────────────────────

  function switchTab(t: Tab) {
    setSearchParams({ tab: t }, { replace: true });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 font-ds-sans">
      <DsPageHeader title="My Results" subtitle="All your exam results in one place." />

      <div className="inline-flex w-fit shrink-0 rounded-md border border-ds-ink/15 bg-ds-fill p-1">
        <button
          onClick={() => switchTab("online")}
          className={cn(
            "rounded px-3.5 py-1.5 font-ds-sans text-[12px] font-medium transition-colors",
            tab === "online" ? "bg-white text-ds-ink shadow-sm" : "text-ds-ink/55 hover:text-ds-ink"
          )}
        >
          Online Tests
        </button>
        <button
          onClick={() => switchTab("paper")}
          className={cn(
            "rounded px-3.5 py-1.5 font-ds-sans text-[12px] font-medium transition-colors",
            tab === "paper" ? "bg-white text-ds-ink shadow-sm" : "text-ds-ink/55 hover:text-ds-ink"
          )}
        >
          Paper Exams
        </button>
      </div>

      {tab === "online" && <OnlineTab loading={onlineLoading} attempts={onlineAttempts} />}
      {tab === "paper" && <PaperTab loading={paperLoading} sheets={sheets} />}
    </div>
  );
}

// ── Online tab ───────────────────────────────────────────────────────────────

function OnlineTab({
  loading,
  attempts,
}: {
  loading: boolean;
  attempts: {
    id: string;
    testTitle: string;
    subject: string;
    score: number;
    maxScore: number;
    status: string;
    createdAtMs: number;
  }[];
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (attempts.length === 0) {
    return (
      <DsCard className="p-12 text-center">
        <p className="font-ds-sans text-[12.5px] text-ds-slate">
          No online test attempts yet. Take a test to see your results here.
        </p>
      </DsCard>
    );
  }

  function statusLabel(s: string) {
    const n = s.toLowerCase();
    if (n === "submitted" || n === "completed" || n === "complete") return "completed";
    if (n === "expired") return "expired";
    return "in-progress";
  }

  const STATUS_TONE: Record<string, PillTone> = {
    completed: "positive",
    "in-progress": "info",
    expired: "accent",
  };

  return (
    <DsCard className="overflow-hidden">
      {attempts.map((a, i) => {
        const st = statusLabel(a.status);
        return (
          <Link key={a.id} to={`/student/results/${a.id}`}>
            <div
              className={
                "flex items-center gap-3 px-4 py-3 hover:bg-ds-fill/40 " +
                (i > 0 ? "border-t border-ds-ink/[.055]" : "")
              }
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-ds-sans text-[12.5px] font-semibold text-ds-ink">
                  {a.testTitle}
                </div>
                <div className="mt-0.5 font-ds-sans text-[11px] text-ds-ink/45">
                  {a.subject && <span>{a.subject} · </span>}
                  {a.createdAtMs ? new Date(a.createdAtMs).toLocaleDateString() : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {st === "completed" && (
                  <span className="font-ds-mono text-[13px] font-semibold text-ds-ink">
                    {a.score}/{a.maxScore}
                  </span>
                )}
                <DsStatusPill tone={STATUS_TONE[st] || "info"}>{st}</DsStatusPill>
              </div>
            </div>
          </Link>
        );
      })}
    </DsCard>
  );
}

// ── Paper tab ────────────────────────────────────────────────────────────────

function PaperTab({ loading, sheets }: { loading: boolean; sheets: AnswerSheet[] }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (sheets.length === 0) {
    return (
      <DsCard className="p-12 text-center">
        <p className="font-ds-sans text-[12.5px] text-ds-slate">
          No paper exam results yet. Your teacher will upload your answer sheet after the exam.
        </p>
      </DsCard>
    );
  }

  return (
    <DsCard className="overflow-hidden">
      {sheets.map((s, i) => (
        <Link key={s.id} to={`/student/exam-results/${s.id}`}>
          <div
            className={
              "flex items-center justify-between gap-3 px-4 py-3 hover:bg-ds-fill/40 " +
              (i > 0 ? "border-t border-ds-ink/[.055]" : "")
            }
          >
            <div>
              <div className="font-ds-sans text-[12.5px] font-semibold text-ds-ink">
                {s.student_name}
              </div>
              <div className="mt-0.5 font-ds-sans text-[11px] text-ds-ink/45">
                {new Date(s.created_at).toLocaleDateString()}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {s.total_marks_awarded != null && (
                <span className="font-ds-mono text-[13px] font-semibold text-ds-ink">
                  {s.total_marks_awarded}/{s.total_max_marks}
                </span>
              )}
              <DsStatusPill tone={SHEET_STATUS_TONE[s.status] || "slate"}>{s.status}</DsStatusPill>
            </div>
          </div>
        </Link>
      ))}
    </DsCard>
  );
}
