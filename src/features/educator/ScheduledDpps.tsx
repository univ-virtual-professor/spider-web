import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  getCountFromServer,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { Button } from "@shared/ui/button";
import { Switch } from "@shared/ui/switch";
import {
  DsPageHeader,
  DsCard,
  DsCardHeader,
  DsTableHead,
  DsTableRow,
  DsStatusPill,
} from "@shared/ui/ds";

// Same backend this page's schedules/generations already go through
// (see DppGenerator.tsx) — this screen only reads and toggles them.
const MONKEY_KING = import.meta.env.VITE_MONKEY_KING_API_URL || "";

type ScheduleRecord = {
  id: string;
  contentTitles: string[];
  difficulty: string;
  startDate: string;
  endDate: string;
  timeOfDay: string;
  targetBatches: string[];
  isActive: boolean;
  lastRunDate: string | null;
  sourceMode?: string;
  topicFilters?: string[];
  subjectFilter?: string | string[];
  chapterFilter?: string | string[];
};

type DppTest = {
  id: string;
  title?: string;
  contentTitles?: string[];
  difficulty?: string;
  targetBatches?: string[];
  createdAt?: { seconds?: number };
};

type BranchDoc = { id: string; name: string };
type CourseDoc = { id: string; branchId: string; name: string };
type BatchDoc = { id: string; branchId: string; courseId: string; name: string };

async function apiFetch(firebaseUser: any, path: string, opts: RequestInit = {}) {
  const token = await firebaseUser.getIdToken();
  return fetch(`${MONKEY_KING}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...opts.headers,
    },
  });
}

function mixChips(schedule: ScheduleRecord): string[] {
  if (schedule.topicFilters?.length) return schedule.topicFilters;
  const subjects = Array.isArray(schedule.subjectFilter)
    ? schedule.subjectFilter
    : schedule.subjectFilter
      ? [schedule.subjectFilter]
      : [];
  if (subjects.length) return subjects;
  const chapters = Array.isArray(schedule.chapterFilter)
    ? schedule.chapterFilter
    : schedule.chapterFilter
      ? [schedule.chapterFilter]
      : [];
  if (chapters.length) return chapters;
  if (schedule.sourceMode === "qb") return ["Question bank"];
  return ["AI generated"];
}

export default function ScheduledDpps() {
  const { firebaseUser } = useAuth();
  const educatorUid = firebaseUser?.uid || "";

  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(true);
  const [dpps, setDpps] = useState<DppTest[]>([]);
  const [batches, setBatches] = useState<BatchDoc[]>([]);
  const [courses, setCourses] = useState<CourseDoc[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState<Record<string, number>>({});

  // Generation rules — same /api/dpp/schedules the DPP Generator reads and writes.
  useEffect(() => {
    if (!firebaseUser) return;
    setLoadingSchedules(true);
    firebaseUser.getIdToken().then((token: string) => {
      fetch(`${MONKEY_KING}/api/dpp/schedules`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => setSchedules(Array.isArray(d) ? d : []))
        .catch(() => {})
        .finally(() => setLoadingSchedules(false));
    });
  }, [firebaseUser]);

  // Most recently generated sets, same source DppGenerator's realtime list uses.
  useEffect(() => {
    if (!educatorUid) return;
    return onSnapshot(
      query(collection(db, "educators", educatorUid, "my_tests"), where("type", "==", "from_dpp")),
      (snap) => {
        const records = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .sort((a: any, b: any) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
          .slice(0, 20);
        setDpps(records);
      }
    );
  }, [educatorUid]);

  // Batch/course names for the rules table, and roster size for submission rate.
  useEffect(() => {
    if (!educatorUid) return;
    (async () => {
      const branchSnap = await getDocs(collection(db, "educators", educatorUid, "branches"));
      const branchesData = branchSnap.docs.map((d) => ({ id: d.id, name: d.data().name })) as BranchDoc[];
      const coursesData: CourseDoc[] = [];
      const batchesData: BatchDoc[] = [];
      for (const b of branchesData) {
        const cSnap = await getDocs(
          collection(db, "educators", educatorUid, "branches", b.id, "courses")
        );
        for (const c of cSnap.docs) {
          coursesData.push({ id: c.id, branchId: b.id, name: c.data().name || "" });
          const bSnap = await getDocs(
            collection(db, "educators", educatorUid, "branches", b.id, "courses", c.id, "batches")
          );
          for (const batch of bSnap.docs) {
            batchesData.push({
              id: batch.id,
              branchId: b.id,
              courseId: c.id,
              name: batch.data().name || "",
            });
          }
        }
      }
      setCourses(coursesData);
      setBatches(batchesData);
    })();

    const unsub = onSnapshot(collection(db, "educators", educatorUid, "students"), (snap) => {
      const counts: Record<string, number> = {};
      snap.docs.forEach((d) => {
        const bid = String((d.data() as any)?.batchId || "");
        if (bid) counts[bid] = (counts[bid] || 0) + 1;
      });
      setStudentCounts(counts);
    });
    return () => unsub();
  }, [educatorUid]);

  const batchName = (id: string) => batches.find((b) => b.id === id)?.name || id;
  const courseName = (id: string) =>
    courses.find((c) => c.id === batches.find((b) => b.id === id)?.courseId)?.name;

  const activeBatchIds = useMemo(
    () => Array.from(new Set(schedules.filter((s) => s.isActive).flatMap((s) => s.targetBatches))),
    [schedules]
  );

  // Submission rate: real attempts for the latest generated set per batch, over its roster.
  useEffect(() => {
    if (!educatorUid || activeBatchIds.length === 0 || dpps.length === 0) return;
    let cancelled = false;
    (async () => {
      const result: Record<string, number> = {};
      for (const bid of activeBatchIds) {
        const latest = dpps.find((d) => d.targetBatches?.includes(bid));
        if (!latest) continue;
        try {
          const snap = await getCountFromServer(
            query(
              collection(db, "attempts"),
              where("educatorId", "==", educatorUid),
              where("testId", "==", latest.id),
              where("batchId", "==", bid)
            )
          );
          result[bid] = snap.data().count;
        } catch {
          // leave unset — rendered as "no data" rather than a fake 0%
        }
      }
      if (!cancelled) setSubmitted(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [educatorUid, activeBatchIds, dpps]);

  const toggleScheduleActive = async (schedId: string, current: boolean) => {
    if (!firebaseUser) return;
    try {
      const res = await apiFetch(firebaseUser, `/api/dpp/schedules/${schedId}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !current }),
      });
      if (!res.ok) throw new Error();
      setSchedules((prev) =>
        prev.map((s) => (s.id === schedId ? { ...s, isActive: !current } : s))
      );
    } catch {
      toast.error("Failed to update schedule");
    }
  };

  const latestDpp = dpps[0];

  return (
    <div className="ds-scope space-y-4 p-4 md:p-6">
      <DsPageHeader
        title="Daily practice"
        subtitle="Rules that generate a practice set for every student, every night."
        primary={{
          label: "New rule",
          onClick: () => {
            window.location.assign("/educator/dpp");
          },
        }}
      />

      <div className="grid gap-3.5 lg:grid-cols-[1.55fr_1fr]">
        <DsCard className="overflow-hidden">
          <DsCardHeader title="Generation rules" meta="runs nightly, per schedule's time" />
          {loadingSchedules ? (
            <div className="flex items-center gap-2 p-4 text-sm text-ds-ink/50">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading schedules...
            </div>
          ) : schedules.length === 0 ? (
            <div className="p-6 text-center font-ds-sans text-[13px] text-ds-ink/55">
              No daily practice rules yet.{" "}
              <Link to="/educator/dpp" className="text-ds-accent underline">
                Create one
              </Link>
              .
            </div>
          ) : (
            <>
              <DsTableHead
                columns={["Batch", "Question mix", "Content", "Difficulty", "State"]}
                cols="1.3fr 1.5fr .7fr .9fr .7fr"
              />
              {schedules.map((s) => (
                <DsTableRow key={s.id} cols="1.3fr 1.5fr .7fr .9fr .7fr" height={52}>
                  <div>
                    <div className="font-semibold">
                      {s.targetBatches.map((bid) => batchName(bid)).join(", ") || "—"}
                    </div>
                    <div className="font-ds-sans text-[11px] text-ds-ink/45">
                      {courseName(s.targetBatches[0]) || ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pr-3">
                    {mixChips(s).map((chip) => (
                      <span
                        key={chip}
                        className="rounded-[5px] bg-ds-fill px-1.5 py-0.5 font-ds-mono text-[10.5px] text-ds-ink/60"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                  <div className="font-ds-mono text-[12px]">{s.contentTitles?.length ?? 0}</div>
                  <div className="capitalize text-ds-ink/70">{s.difficulty}</div>
                  <div className="flex justify-end">
                    <Switch
                      checked={s.isActive}
                      onCheckedChange={() => toggleScheduleActive(s.id, s.isActive)}
                    />
                  </div>
                </DsTableRow>
              ))}
              <div className="bg-ds-canvas px-4 py-3 font-ds-sans text-[12px] leading-[1.6] text-ds-ink/55">
                Questions are drawn from the content, topics or question bank filters set on each
                rule. A student never sees the same question twice within 60 days.
              </div>
            </>
          )}
        </DsCard>

        <div className="flex flex-col gap-3.5">
          <DsCard className="p-4">
            <div className="mb-3 flex items-center">
              <div className="font-ds-sans text-[13.5px] font-semibold text-ds-ink">
                Tonight&apos;s set{latestDpp ? ` · ${latestDpp.title || "Daily practice"}` : ""}
              </div>
              <div className="flex-1" />
              {latestDpp && (
                <DsStatusPill tone="info">{latestDpp.difficulty || "mixed"}</DsStatusPill>
              )}
            </div>
            {!latestDpp ? (
              <p className="font-ds-sans text-[12.5px] text-ds-ink/55">
                No set has been generated yet.
              </p>
            ) : (
              <div className="space-y-2">
                {(latestDpp.contentTitles?.length ? latestDpp.contentTitles : ["—"]).map(
                  (title, i) => (
                    <div
                      key={`${title}-${i}`}
                      className="rounded-[7px] border border-ds-ink/[.08] px-2.5 py-1.5 font-ds-sans text-[12px] text-ds-ink/75"
                    >
                      {title}
                    </div>
                  )
                )}
              </div>
            )}
            <Button
              variant="outline"
              className="mt-3.5 h-8 w-full rounded-[7px] border-ds-ink/15 font-ds-sans text-[12px] font-semibold"
              onClick={() => window.location.assign("/educator/dpp")}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Regenerate
            </Button>
            <p className="mt-2 font-ds-sans text-[11px] text-ds-ink/45">
              Sets publish to students as soon as they are generated — there is no separate
              approval step.
            </p>
          </DsCard>

          <DsCard className="flex-1 p-4">
            <div className="mb-2.5 font-ds-sans text-[13.5px] font-semibold text-ds-ink">
              Submission rate
            </div>
            {activeBatchIds.length === 0 ? (
              <p className="font-ds-sans text-[12.5px] text-ds-ink/55">
                No active rules to report on.
              </p>
            ) : (
              activeBatchIds.map((bid) => {
                const roster = studentCounts[bid] ?? 0;
                const done = submitted[bid];
                const pct = done != null && roster > 0 ? Math.round((100 * done) / roster) : null;
                return (
                  <div key={bid} className="mb-3 last:mb-0">
                    <div className="flex items-baseline">
                      <div className="font-ds-sans text-[12.5px] font-medium">
                        {batchName(bid)}
                      </div>
                      <div className="flex-1" />
                      <div className="font-ds-mono text-[11.5px] text-ds-info">
                        {pct != null ? `${pct}%` : "—"}
                      </div>
                    </div>
                    <div className="mb-1.5 mt-0.5 font-ds-sans text-[11px] text-ds-ink/45">
                      {done != null
                        ? `${done} of ${roster} students submitted`
                        : "No set generated for this batch yet"}
                    </div>
                    <div className="h-[5px] overflow-hidden rounded-full bg-ds-fill">
                      <div
                        className="h-[5px] rounded-full bg-ds-info"
                        style={{ width: `${pct ?? 0}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </DsCard>
        </div>
      </div>
    </div>
  );
}
