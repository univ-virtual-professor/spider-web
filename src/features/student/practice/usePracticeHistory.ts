// Recent practice history (streak + past sets) for the practice player's right rail.
// Reuses the same "attempts" collection and dpp/practice title heuristic already used by
// StudentAttempts.tsx and StudentRankings.tsx — the attempt doc has no test `type` field, only
// `testTitle`, so there is no more precise signal to classify on without a schema change.
import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query, where, Timestamp } from "firebase/firestore";
import { db } from "@shared/lib/firebase";

export type PastPracticeSet = {
  id: string;
  title: string;
  dateLabel: string;
  score: number;
  maxScore: number;
};

export type PracticeHistory = {
  loading: boolean;
  error: boolean;
  dayStreak: number;
  pastSets: PastPracticeSet[];
};

const isPracticeTitle = (title: string) => {
  const t = title.toLowerCase();
  return t.includes("dpp") || t.includes("practice");
};

function toMillis(v: unknown): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  const asTimestamp = v as Timestamp;
  if (typeof asTimestamp?.toMillis === "function") return asTimestamp.toMillis();
  return 0;
}

export function usePracticeHistory(
  studentId: string | undefined,
  educatorId: string | undefined,
  excludeAttemptId: string | null
): PracticeHistory {
  const [state, setState] = useState<PracticeHistory>({
    loading: true,
    error: false,
    dayStreak: 0,
    pastSets: [],
  });

  useEffect(() => {
    if (!studentId || !educatorId) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    let mounted = true;
    setState((s) => ({ ...s, loading: true, error: false }));

    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, "attempts"),
            where("studentId", "==", studentId),
            where("educatorId", "==", educatorId),
            orderBy("createdAt", "desc")
          )
        );

        const rows = snap.docs
          .map((d) => {
            const data = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              title: String(data.testTitle || "Untitled"),
              status: String(data.status || ""),
              score: Number(data.score ?? 0),
              maxScore: Number(data.maxScore ?? 0),
              createdAtMs: toMillis(data.createdAt),
            };
          })
          .filter((r) => r.id !== excludeAttemptId)
          .filter((r) => isPracticeTitle(r.title))
          .filter((r) => r.status === "submitted" || r.status === "completed")
          .sort((a, b) => b.createdAtMs - a.createdAtMs);

        // Day streak: consecutive calendar days with at least one completed practice set,
        // counting back from the most recent one (so a streak "as of last practice", not
        // necessarily today — avoids showing 0 just because today's set isn't done yet).
        const days = new Set(
          rows.map((r) => new Date(r.createdAtMs).toDateString()).filter(Boolean)
        );
        let dayStreak = 0;
        if (rows.length) {
          const cursor = new Date(rows[0].createdAtMs);
          cursor.setHours(0, 0, 0, 0);
          while (days.has(cursor.toDateString())) {
            dayStreak += 1;
            cursor.setDate(cursor.getDate() - 1);
          }
        }

        const pastSets: PastPracticeSet[] = rows.slice(0, 4).map((r) => ({
          id: r.id,
          title: r.title,
          dateLabel: new Date(r.createdAtMs).toLocaleDateString(undefined, {
            weekday: "short",
            day: "numeric",
            month: "short",
          }),
          score: r.score,
          maxScore: r.maxScore,
        }));

        if (mounted) setState({ loading: false, error: false, dayStreak, pastSets });
      } catch (e) {
        console.error("[usePracticeHistory] failed:", e);
        if (mounted) setState({ loading: false, error: true, dayStreak: 0, pastSets: [] });
      }
    })();

    return () => {
      mounted = false;
    };
  }, [studentId, educatorId, excludeAttemptId]);

  return state;
}
