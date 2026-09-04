import { useEffect, useState } from "react";
import {
  Copy,
  Check,
  CreditCard,
  Users,
  UserCheck,
  Layers,
  CalendarCheck,
  BookOpen,
} from "lucide-react";
import { Link } from "react-router-dom";

import { collection, doc, onSnapshot, getDocs } from "firebase/firestore";

import { Button } from "@shared/ui/button";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { buildTenantUrl } from "@shared/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

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

export default function EducatorDashboard() {
  const { firebaseUser, profile, loading: authLoading } = useAuth();
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

  // Batches count — fan out branches → courses → batches
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
        if (!cancelled) {
          setBatchesCount(batchLists.reduce((sum, snap) => sum + snap.size, 0));
        }
      } catch {
        if (!cancelled) setBatchesCount(0);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [educatorId]);

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

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="gradient-bg rounded-2xl p-5 text-white md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold md:text-2xl">Welcome back, {coachingName}!</h2>
            <p className="mt-1 text-sm text-white/80">Here's your institute at a glance.</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="w-full shrink-0 border border-white/30 bg-white/15 text-white hover:bg-white/25 md:w-auto"
            onClick={handleCopyUrl}
            disabled={!coachingUrl}
          >
            {copiedUrl ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Copy Coaching URL
              </>
            )}
          </Button>
        </div>
      </div>

      {/* LMS snapshot cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Link to="/educator/batches" className="group block">
          <Card className="border-border/50 transition-all hover:border-primary/40 hover:shadow-sm">
            <CardContent className="flex items-center gap-3 py-5">
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none">{batchesCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">Batches</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link to="/educator/learners" className="group block">
          <Card className="border-border/50 transition-all hover:border-primary/40 hover:shadow-sm">
            <CardContent className="flex items-center gap-3 py-5">
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <UserCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none">{studentsCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">Students</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link to="/educator/curriculum" className="group block">
          <Card className="border-border/50 transition-all hover:border-primary/40 hover:shadow-sm">
            <CardContent className="flex items-center gap-3 py-5">
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">Curriculum</p>
                <p className="mt-1 text-xs text-muted-foreground">Build syllabus</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link to="/educator/attendance" className="group block">
          <Card className="border-border/50 transition-all hover:border-primary/40 hover:shadow-sm">
            <CardContent className="flex items-center gap-3 py-5">
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <CalendarCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">Attendance</p>
                <p className="mt-1 text-xs text-muted-foreground">Mark today</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            Seats &amp; Plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Active Plan</p>
              <p className="mt-0.5 font-semibold">{planName || "No plan"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Seats</p>
              <p className="mt-0.5 font-semibold">{seatLimit}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Enrolled</p>
              <p className="mt-0.5 font-semibold">{usedSeats}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vacant</p>
              <p
                className={`mt-0.5 font-semibold ${vacantSeats === 0 ? "text-destructive" : "text-green-500"}`}
              >
                {vacantSeats}
              </p>
            </div>
          </div>
          {allowedCourseNames.length > 0 && (
            <div className="mt-5 border-t border-border/50 pt-4">
              <p className="mb-2 text-xs text-muted-foreground">Allowed Courses</p>
              <div className="flex flex-wrap gap-1.5">
                {allowedCourseNames.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="gap-2">
              <Link to="/educator/curriculum">
                <Layers className="h-4 w-4" />
                Build Curriculum
              </Link>
            </Button>
            <Button variant="outline" asChild className="gap-2">
              <Link to="/educator/attendance">
                <CalendarCheck className="h-4 w-4" />
                Mark Attendance
              </Link>
            </Button>
            <Button variant="outline" asChild className="gap-2">
              <Link to="/educator/content">
                <BookOpen className="h-4 w-4" />
                Manage Content
              </Link>
            </Button>
            <Button variant="outline" asChild className="gap-2">
              <Link to="/educator/learners">
                <Users className="h-4 w-4" />
                View Students
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
