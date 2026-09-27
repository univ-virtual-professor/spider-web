import { useEffect, useState } from "react";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { useEmployee } from "@shared/contexts/EmployeeContext";
import { Button } from "@shared/ui/button";
import {
  DsPageHeader,
  DsCard,
  DsCardHeader,
  DsTableHead,
  DsTableRow,
  DsStatusPill,
  DsMeter,
} from "@shared/ui/ds";
import { Check, X, Loader2 } from "lucide-react";

type Branch = { id: string; name: string };
type Slot = {
  id: string;
  subject: string;
  teacherUid: string;
  teacherName?: string;
  dayOfWeek: number;
  startTime: string;
};

// Defaulter window: this codebase has no explicit "term" boundary anywhere
// (Timetable/Attendance are just recurring weekly slots + ad-hoc sessions),
// so "this term" is approximated as a rolling 30-day window.
const DEFAULTER_WINDOW_DAYS = 30;
const DEFAULTER_THRESHOLD_PCT = 75;

type TodayRow = {
  branchId: string;
  courseId: string;
  batchId: string;
  batchName: string;
  slotId: string;
  subject: string;
  teacherName: string;
  startTime: string;
  marked: boolean;
  presentCount: number;
  totalCount: number;
};

type Defaulter = { studentId: string; name: string; batchName: string; pct: number };

type CorrectionRow = {
  path: string;
  studentId?: string;
  studentName: string;
  currentStatus: string;
  requestedStatus: string;
  reason: string;
  requestedByName: string;
  batchName?: string;
  date?: string;
};

export default function AttendanceOps() {
  const { profile } = useAuth();
  const educatorId: string = profile?.uid ?? "";
  const { isEmployee } = useEmployee();
  const navigate = useNavigate();
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayDow = new Date().getDay();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TodayRow[]>([]);
  const [defaulters, setDefaulters] = useState<Defaulter[]>([]);
  const [defaultersLoading, setDefaultersLoading] = useState(true);
  const [corrections, setCorrections] = useState<CorrectionRow[]>([]);
  const [correctionsLoading, setCorrectionsLoading] = useState(true);

  useEffect(() => {
    if (!educatorId) return;
    let cancelled = false;

    async function run() {
      const branchSnap = await getDocs(collection(db, "educators", educatorId, "branches"));
      const branches: Branch[] = branchSnap.docs.map((d) => ({ id: d.id, name: d.data().name }));

      const todayRows: TodayRow[] = [];
      const cutoff = subDays(new Date(), DEFAULTER_WINDOW_DAYS);
      const studentTally = new Map<
        string,
        { name: string; batchName: string; present: number; total: number }
      >();

      for (const branch of branches) {
        const courseSnap = await getDocs(
          collection(db, "educators", educatorId, "branches", branch.id, "courses")
        );
        for (const courseDoc of courseSnap.docs) {
          const batchSnap = await getDocs(
            collection(
              db,
              "educators",
              educatorId,
              "branches",
              branch.id,
              "courses",
              courseDoc.id,
              "batches"
            )
          );
          for (const batchDoc of batchSnap.docs) {
            const batchName = String(batchDoc.data().name || "Batch");
            const batchPath = [
              "educators",
              educatorId,
              "branches",
              branch.id,
              "courses",
              courseDoc.id,
              "batches",
              batchDoc.id,
            ] as const;

            // Roster, for computing presence % against the whole batch, not just marked students
            const rosterSnap = await getDocs(
              query(
                collection(db, "educators", educatorId, "students"),
                where("batchId", "==", batchDoc.id)
              )
            );
            const roster = rosterSnap.docs.map((d) => ({
              id: d.id,
              name: String(d.data().name || d.data().displayName || "Student"),
            }));
            for (const s of roster) {
              if (!studentTally.has(s.id)) {
                studentTally.set(s.id, { name: s.name, batchName, present: 0, total: 0 });
              }
            }

            // Today's slots -> today's status row
            const slotSnap = await getDocs(
              query(collection(db, ...batchPath, "timetable"), where("dayOfWeek", "==", todayDow))
            );
            for (const slotDoc of slotSnap.docs) {
              const slot = { id: slotDoc.id, ...(slotDoc.data() as any) } as Slot;
              const sessionSnap = await getDoc(
                doc(db, ...batchPath, "sessions", `${slot.id}_${todayStr}`)
              );
              const data = sessionSnap.exists() ? (sessionSnap.data() as any) : null;
              const attendance: Record<string, string> = data?.attendance || {};
              const presentCount = Object.values(attendance).filter((s) => s === "present").length;
              todayRows.push({
                branchId: branch.id,
                courseId: courseDoc.id,
                batchId: batchDoc.id,
                batchName,
                slotId: slot.id,
                subject: slot.subject,
                teacherName: slot.teacherName || "",
                startTime: slot.startTime,
                marked: !!data,
                presentCount,
                totalCount: roster.length,
              });
            }

            // Rolling window sessions -> defaulter tally
            const sessionSnap = await getDocs(collection(db, ...batchPath, "sessions"));
            for (const sDoc of sessionSnap.docs) {
              const d = sDoc.data() as any;
              if (!d.date || d.date < format(cutoff, "yyyy-MM-dd")) continue;
              const attendance: Record<string, string> = d.attendance || {};
              for (const [studentId, status] of Object.entries(attendance)) {
                const entry = studentTally.get(studentId);
                if (!entry) continue;
                entry.total += 1;
                if (status === "present" || status === "late") entry.present += 1;
              }
            }
          }
        }
      }

      const defaulterRows: Defaulter[] = [...studentTally.entries()]
        .filter(([, v]) => v.total >= 3)
        .map(([studentId, v]) => ({
          studentId,
          name: v.name,
          batchName: v.batchName,
          pct: (v.present / v.total) * 100,
        }))
        .filter((d) => d.pct < DEFAULTER_THRESHOLD_PCT)
        .sort((a, b) => a.pct - b.pct)
        .slice(0, 20);

      if (!cancelled) {
        setRows(todayRows.sort((a, b) => a.startTime.localeCompare(b.startTime)));
        setDefaulters(defaulterRows);
        setLoading(false);
        setDefaultersLoading(false);
      }
    }

    run().catch(() => {
      setLoading(false);
      setDefaultersLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [educatorId, todayStr, todayDow]);

  useEffect(() => {
    if (!educatorId) return;
    const unsub = onSnapshot(
      query(collectionGroup(db, "correctionRequests"), where("status", "==", "pending")),
      (snap) => {
        const orgPrefix = `educators/${educatorId}/`;
        setCorrections(
          snap.docs
            .filter((d) => d.ref.path.startsWith(orgPrefix))
            .map((d) => ({ path: d.ref.path, ...(d.data() as any) }))
        );
        setCorrectionsLoading(false);
      },
      () => setCorrectionsLoading(false)
    );
    return () => unsub();
  }, [educatorId]);

  async function resolveCorrection(row: CorrectionRow, apply: boolean) {
    try {
      const sessionPath = row.path.split("/correctionRequests/")[0];
      if (apply) {
        await updateDoc(doc(db, sessionPath), {
          [`attendance.${row.studentId}`]: row.requestedStatus,
          updatedAt: Timestamp.now(),
        });
      }
      await updateDoc(doc(db, row.path), {
        status: apply ? "applied" : "rejected",
        resolvedBy: profile?.uid || "",
        resolvedAt: Timestamp.now(),
      });
      toast.success(apply ? "Applied" : "Rejected");
    } catch {
      toast.error("Failed — only the owning teacher or org head can resolve this");
    }
  }

  const markedCount = rows.filter((r) => r.marked).length;

  return (
    <div className="space-y-5 font-ds-sans">
      <DsPageHeader
        title="Attendance"
        subtitle={`Institute-wide, today. Faculty mark it; you chase what is missing.`}
      />

      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.5fr)_1fr]">
        <DsCard className="overflow-hidden">
          <DsCardHeader
            title={`Today · ${format(new Date(), "EEE d MMM")}`}
            meta={loading ? undefined : `${markedCount} of ${rows.length} batches marked`}
          />
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-ds-slate" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center font-ds-sans text-[12.5px] text-ds-slate">
              No classes scheduled today.
            </p>
          ) : (
            <>
              <DsTableHead
                columns={["Batch", "Session", "Present today", "Status"]}
                cols="1.4fr .7fr 1.2fr .9fr"
              />
              {rows.map((r) => (
                <DsTableRow
                  key={`${r.batchId}-${r.slotId}`}
                  cols="1.4fr .7fr 1.2fr .9fr"
                  height={46}
                >
                  <div>
                    <div className="font-semibold">{r.batchName}</div>
                    <div className="font-ds-sans text-[11px] text-ds-ink/45">
                      {r.subject}
                      {r.teacherName ? ` · ${r.teacherName}` : ""}
                    </div>
                  </div>
                  <div className="font-ds-mono text-[11.5px] text-ds-ink/60">{r.startTime}</div>
                  <div className="pr-3.5">
                    {r.marked ? (
                      <DsMeter
                        pct={r.totalCount ? (r.presentCount / r.totalCount) * 100 : 0}
                        tone={
                          r.totalCount && r.presentCount / r.totalCount < 0.75
                            ? "accent"
                            : "positive"
                        }
                      />
                    ) : (
                      <span className="font-ds-sans text-[11.5px] text-ds-ink/35">—</span>
                    )}
                  </div>
                  <div className="flex justify-end">
                    {r.marked ? (
                      <DsStatusPill tone="positive">Marked</DsStatusPill>
                    ) : (
                      <button
                        className="font-ds-sans text-[11.5px] font-semibold text-ds-accent hover:underline"
                        onClick={() =>
                          navigate("/educator/attendance", {
                            state: { batchId: r.batchId, date: todayStr },
                          })
                        }
                      >
                        Mark now
                      </button>
                    )}
                  </div>
                </DsTableRow>
              ))}
            </>
          )}
        </DsCard>

        <div className="flex flex-col gap-3.5">
          <DsCard className="p-4">
            <div className="font-ds-sans text-[13.5px] font-semibold text-ds-ink">
              Below {DEFAULTER_THRESHOLD_PCT}% this term
            </div>
            <p className="mb-3 mt-1 font-ds-sans text-[11.5px] leading-[1.5] text-ds-ink/50">
              {defaultersLoading
                ? "Calculating…"
                : `${defaulters.length} student${defaulters.length === 1 ? "" : "s"} in the last ${DEFAULTER_WINDOW_DAYS} days.`}
            </p>
            {!defaultersLoading &&
              defaulters.slice(0, 6).map((d) => (
                <div
                  key={d.studentId}
                  className="flex items-center gap-2.5 border-b border-ds-ink/[.055] py-2 last:border-0"
                >
                  <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-ds-accent/15 font-ds-sans text-[10px] font-semibold text-ds-accent">
                    {d.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-ds-sans text-[12.5px] font-medium text-ds-ink">
                      {d.name}
                    </div>
                    <div className="truncate font-ds-sans text-[11px] text-ds-ink/45">
                      {d.batchName}
                    </div>
                  </div>
                  <div className="ml-auto font-ds-mono text-[12px] font-semibold text-ds-accent">
                    {Math.round(d.pct)}%
                  </div>
                </div>
              ))}
            {!defaultersLoading && defaulters.length === 0 && (
              <p className="py-2 font-ds-sans text-[11.5px] text-ds-ink/40">
                No one below threshold.
              </p>
            )}
          </DsCard>

          <DsCard className="flex flex-1 flex-col p-4">
            <div className="mb-2.5 font-ds-sans text-[13.5px] font-semibold text-ds-ink">
              Corrections requested
            </div>
            {correctionsLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-ds-slate" />
              </div>
            ) : corrections.length === 0 ? (
              <p className="font-ds-sans text-[11.5px] text-ds-ink/40">No pending requests.</p>
            ) : (
              corrections.map((row) => (
                <div key={row.path} className="border-b border-ds-ink/[.055] py-2.5 last:border-0">
                  <div className="flex items-baseline gap-2">
                    <div className="font-ds-sans text-[12.5px] font-medium text-ds-ink">
                      {row.studentName}
                    </div>
                    <div className="flex-1" />
                    <div className="font-ds-mono text-[11px] text-ds-ink/45">{row.date}</div>
                  </div>
                  <div className="mt-0.5 font-ds-sans text-[11.5px] leading-[1.45] text-ds-ink/50">
                    {row.currentStatus} → {row.requestedStatus}
                    {row.reason ? ` · ${row.reason}` : ""}
                  </div>
                  {!isEmployee && (
                    <div className="mt-2 flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-[26px] gap-1 border-ds-ink/15 px-2.5 font-ds-sans text-[11px]"
                        onClick={() => resolveCorrection(row, true)}
                      >
                        <Check className="h-3 w-3" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-[26px] gap-1 px-2.5 font-ds-sans text-[11px] text-ds-slate"
                        onClick={() => resolveCorrection(row, false)}
                      >
                        <X className="h-3 w-3" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </DsCard>
        </div>
      </div>
    </div>
  );
}
