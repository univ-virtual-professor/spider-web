import { useEffect, useState } from "react";
import {
  Copy,
  Check,
  CreditCard,
  Users,
  Layers,
  CalendarCheck,
  CalendarClock,
  BookOpen,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { collection, doc, onSnapshot, getDocs, query, where } from "firebase/firestore";

import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { buildTenantUrl } from "@shared/lib/tenant";
import {
  DsPageHeader,
  DsCard,
  DsCardHeader,
  DsKpiRow,
  DsTableHead,
  DsTableRow,
} from "@shared/ui/ds";

type EducatorProfileDoc = {
  displayName?: string;
  fullName?: string;
  name?: string;
  coachingName?: string;
  tenantSlug?: string;
  planName?: string;
  seatLimit?: number;
  usedSeats?: number;
  allowedCourseIds?: string[];
};

type TodayClass = {
  id: string;
  subject: string;
  startTime: string;
  endTime: string;
  teacherUid: string;
  teacherName: string;
  batchId: string;
  batchName: string;
};

export default function EducatorDashboard() {
  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const uid = firebaseUser?.uid || null;
  const educatorId = profile?.educatorId || uid;

  const [educatorDoc, setEducatorDoc] = useState<EducatorProfileDoc | null>(null);
  const [usedSeatsCount, setUsedSeatsCount] = useState(0);
  const [poolSeatTotal, setPoolSeatTotal] = useState(0);
  const [poolPlanName, setPoolPlanName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [allowedCourseNames, setAllowedCourseNames] = useState<string[]>([]);
  const [studentsCount, setStudentsCount] = useState(0);
  const [batchesCount, setBatchesCount] = useState(0);
  const [allClassesToday, setAllClassesToday] = useState<TodayClass[]>([]);

  useEffect(() => {
    if (!educatorId) return;

    const unsubEdu = onSnapshot(
      doc(db, "educators", educatorId),
      (snap) => setEducatorDoc(snap.exists() ? (snap.data() as EducatorProfileDoc) : null),
      () => setEducatorDoc(null)
    );

    const unsubSeats = onSnapshot(
      collection(db, "educators", educatorId, "billingSeats"),
      (snap) => {
        setUsedSeatsCount(
          snap.docs.filter((d) => String(d.data()?.status || "").toLowerCase() === "active").length
        );
        setLoaded(true);
      },
      () => {
        setUsedSeatsCount(0);
        setLoaded(true);
      }
    );

    const unsubPools = onSnapshot(
      collection(db, "educators", educatorId, "seatPools"),
      (snap) => {
        setPoolSeatTotal(snap.docs.reduce((s, d) => s + (Number(d.data().totalSeats) || 0), 0));
        setPoolPlanName(snap.docs[0]?.data().planName || null);
      },
      () => {
        setPoolSeatTotal(0);
        setPoolPlanName(null);
      }
    );

    const unsubStudents = onSnapshot(
      collection(db, "educators", educatorId, "students"),
      (snap) => setStudentsCount(snap.size),
      () => setStudentsCount(0)
    );

    return () => {
      unsubEdu();
      unsubSeats();
      unsubPools();
      unsubStudents();
    };
  }, [educatorId]);

  // Batches count + today's timetable — fan out branches → courses → batches → timetable
  useEffect(() => {
    if (!educatorId) return;
    let cancelled = false;

    (async () => {
      try {
        const branchesSnap = await getDocs(collection(db, "educators", educatorId, "branches"));
        const courseLists = await Promise.all(
          branchesSnap.docs.map((b) =>
            getDocs(collection(db, "educators", educatorId, "branches", b.id, "courses"))
          )
        );
        const courseRefs = courseLists.flatMap((snap, i) =>
          snap.docs.map((c) => ({ branchId: branchesSnap.docs[i].id, courseId: c.id }))
        );
        const batchLists = await Promise.all(
          courseRefs.map((c) =>
            getDocs(
              collection(
                db,
                "educators",
                educatorId,
                "branches",
                c.branchId,
                "courses",
                c.courseId,
                "batches"
              )
            )
          )
        );
        if (cancelled) return;
        setBatchesCount(batchLists.reduce((sum, snap) => sum + snap.size, 0));

        const batchRefs = batchLists.flatMap((snap, i) =>
          snap.docs.map((b) => ({
            branchId: courseRefs[i].branchId,
            courseId: courseRefs[i].courseId,
            batchId: b.id,
            batchName: String(b.data().name || b.id),
          }))
        );
        const todayDow = new Date().getDay();
        const slotLists = await Promise.all(
          batchRefs.map((b) =>
            getDocs(
              query(
                collection(
                  db,
                  "educators",
                  educatorId,
                  "branches",
                  b.branchId,
                  "courses",
                  b.courseId,
                  "batches",
                  b.batchId,
                  "timetable"
                ),
                where("dayOfWeek", "==", todayDow)
              )
            )
          )
        );
        if (cancelled) return;
        const classes: TodayClass[] = slotLists.flatMap((snap, i) =>
          snap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              subject: String(data.subject || "Class"),
              startTime: String(data.startTime || ""),
              endTime: String(data.endTime || ""),
              teacherUid: String(data.teacherUid || ""),
              teacherName: String(data.teacherName || ""),
              batchId: batchRefs[i].batchId,
              batchName: batchRefs[i].batchName,
            };
          })
        );
        classes.sort((a, b) => a.startTime.localeCompare(b.startTime));
        setAllClassesToday(classes);
      } catch {
        if (!cancelled) {
          setBatchesCount(0);
          setAllClassesToday([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [educatorId]);

  const myClassesToday = allClassesToday.filter((c) => c.teacherUid === uid);
  const todayStr = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    const ids = educatorDoc?.allowedCourseIds;
    if (!ids || ids.length === 0) {
      setAllowedCourseNames([]);
      return;
    }
    getDocs(collection(db, "courses"))
      .then((snap) => {
        setAllowedCourseNames(
          snap.docs.filter((d) => ids.includes(d.id)).map((d) => (d.data() as any).name || d.id)
        );
      })
      .catch(() => setAllowedCourseNames([]));
  }, [educatorDoc?.allowedCourseIds]);

  const coachingName =
    String(
      educatorDoc?.coachingName ||
        educatorDoc?.displayName ||
        educatorDoc?.name ||
        profile?.displayName ||
        "Your Coaching"
    ).trim() || "Your Coaching";

  const coachingSlug = String(educatorDoc?.tenantSlug || profile?.tenantSlug || "").trim();
  const coachingUrl = coachingSlug ? buildTenantUrl(coachingSlug, "/") : "";

  const planName = poolPlanName || "Free Tier";
  const seatLimit = poolSeatTotal;
  const usedSeats = usedSeatsCount;
  const vacantSeats = Math.max(0, seatLimit - usedSeats);

  async function handleCopyUrl() {
    if (!coachingUrl) return;
    try {
      await navigator.clipboard.writeText(coachingUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 1800);
    } catch {
      /* clipboard may be blocked */
    }
  }

  if (authLoading || (!loaded && !!educatorId)) {
    return <div className="py-12 text-center text-muted-foreground">Loading...</div>;
  }

  if (!educatorId) {
    return <div className="py-12 text-center text-muted-foreground">Please login as Educator</div>;
  }

  const kpis = [
    {
      label: "Batches",
      value: String(batchesCount),
      tone: "accent" as const,
      pct: Math.min(100, batchesCount * 10),
    },
    {
      label: "Students",
      value: String(studentsCount),
      tone: "info" as const,
      pct: Math.min(100, studentsCount),
    },
    {
      label: "Seats vacant",
      value: String(vacantSeats),
      sub: `of ${seatLimit} total`,
      tone: vacantSeats === 0 ? ("accent" as const) : ("positive" as const),
      pct: seatLimit ? (vacantSeats / seatLimit) * 100 : 0,
    },
    {
      label: "Sessions today",
      value: String(allClassesToday.length),
      sub: `${myClassesToday.length} are yours`,
      tone: "slate" as const,
      pct: Math.min(100, allClassesToday.length * 12),
    },
  ];

  return (
    <div className="space-y-5 font-ds-sans">
      <DsPageHeader
        title="Today"
        subtitle={`${coachingName} · ${planName || "No plan"}`}
        secondary={
          coachingUrl
            ? {
                label: copiedUrl ? "Copied" : "Copy site link",
                icon: copiedUrl ? (
                  <Check className="mr-1 h-3.5 w-3.5" />
                ) : (
                  <Copy className="mr-1 h-3.5 w-3.5" />
                ),
                onClick: handleCopyUrl,
              }
            : undefined
        }
      />

      <DsKpiRow items={kpis} />

      {myClassesToday.length > 0 && (
        <DsCard>
          <DsCardHeader title="My classes today" />
          <div>
            {myClassesToday.map((c) => (
              <DsTableRow key={c.id} cols="1fr auto" height={56}>
                <div className="flex items-center gap-2.5">
                  <div className="h-6 w-[3px] shrink-0 rounded-sm bg-ds-accent" />
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{c.subject}</div>
                    <div className="mt-0.5 truncate font-ds-sans text-[11px] text-ds-ink/45">
                      {c.startTime}–{c.endTime} · {c.batchName}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() =>
                    navigate("/educator/attendance", {
                      state: { batchId: c.batchId, date: todayStr },
                    })
                  }
                  className="h-7 rounded-md border border-ds-ink/15 px-2.5 font-ds-sans text-[11.5px] font-semibold text-ds-ink hover:bg-ds-fill"
                >
                  Mark attendance
                </button>
              </DsTableRow>
            ))}
          </div>
        </DsCard>
      )}

      {allClassesToday.length > 0 && (
        <DsCard className="overflow-hidden">
          <DsCardHeader
            title="Today across all batches"
            meta={`${allClassesToday.length} sessions`}
          />
          <DsTableHead
            columns={["Subject", "Batch", "Time", "Teacher"]}
            cols="1.2fr 1fr .9fr 1fr"
          />
          {allClassesToday.map((c) => (
            <DsTableRow key={c.id} cols="1.2fr 1fr .9fr 1fr">
              <div className="font-semibold">{c.subject}</div>
              <div className="text-ds-ink/70">{c.batchName}</div>
              <div className="font-ds-mono text-[11.5px] text-ds-ink/60">
                {c.startTime}–{c.endTime}
              </div>
              <div className="text-ds-ink/60">{c.teacherName}</div>
            </DsTableRow>
          ))}
        </DsCard>
      )}

      <div className="grid items-start gap-3.5 lg:grid-cols-2">
        <DsCard className="p-4">
          <div className="mb-2.5 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-ds-slate" />
            <div className="font-ds-sans text-[13.5px] font-semibold text-ds-ink">
              Seats &amp; plan
            </div>
          </div>
          {[
            ["Active plan", planName || "No plan"],
            ["Total seats", String(seatLimit)],
            ["Enrolled", String(usedSeats)],
            ["Vacant", String(vacantSeats)],
          ].map(([k, v]) => (
            <div
              key={k}
              className="flex justify-between gap-3 border-b border-ds-ink/[.055] py-2 font-ds-sans text-[12px] last:border-0"
            >
              <div className="text-ds-ink/50">{k}</div>
              <div
                className={`text-right font-medium ${k === "Vacant" && vacantSeats === 0 ? "text-ds-accent" : "text-ds-ink"}`}
              >
                {v}
              </div>
            </div>
          ))}
          {allowedCourseNames.length > 0 && (
            <div className="mt-3.5 flex flex-wrap gap-1.5 border-t border-ds-ink/[.08] pt-3.5">
              {allowedCourseNames.map((name) => (
                <span
                  key={name}
                  className="rounded-md bg-ds-fill px-2 py-0.5 font-ds-sans text-[11px] font-medium text-ds-ink/70"
                >
                  {name}
                </span>
              ))}
            </div>
          )}
        </DsCard>

        <DsCard className="p-4">
          <div className="mb-2.5 font-ds-sans text-[13.5px] font-semibold text-ds-ink">
            Quick actions
          </div>
          <div className="flex flex-col gap-1.5">
            {[
              { icon: Layers, label: "Build curriculum", href: "/educator/curriculum" },
              { icon: CalendarCheck, label: "Mark attendance", href: "/educator/attendance" },
              { icon: CalendarClock, label: "View timetable", href: "/educator/timetable" },
              { icon: BookOpen, label: "Manage content", href: "/educator/content" },
              { icon: Users, label: "View students", href: "/educator/learners" },
            ].map((a) => (
              <Link
                key={a.href}
                to={a.href}
                className="flex items-center gap-2.5 rounded-md border border-ds-ink/[.09] px-3 py-2 font-ds-sans text-[12.5px] font-medium text-ds-ink hover:bg-ds-fill"
              >
                <a.icon className="h-3.5 w-3.5 text-ds-slate" />
                {a.label}
              </Link>
            ))}
          </div>
        </DsCard>
      </div>
    </div>
  );
}
