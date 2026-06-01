import { useEffect, useState } from "react";
import {
  Copy,
  Check,
  BarChart3,
  Users,
  Plus,
  CreditCard,
  CalendarRange,
  BookOpenCheck,
} from "lucide-react";
import { Link } from "react-router-dom";

import CheatActivityFeed from "./components/CheatActivityFeed";
import ActiveTestsFeed from "./components/ActiveTestsFeed";
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

  const [scheduledTestsCount, setScheduledTestsCount] = useState(0);
  const [scheduledDppsCount, setScheduledDppsCount] = useState(0);

  useEffect(() => {
    if (!educatorId) return;

    const unsubEdu = onSnapshot(
      doc(db, "educators", educatorId),
      (snap) => {
        setEducatorDoc(snap.exists() ? (snap.data() as EducatorProfileDoc) : null);
      },
      () => setEducatorDoc(null)
    );

    const unsubSeats = onSnapshot(
      collection(db, "educators", educatorId, "billingSeats"),
      (snap) => {
        const activeCount = snap.docs.filter(
          (d) => String(d.data()?.status || "").toLowerCase() === "active"
        ).length;
        setUsedSeatsCount(activeCount);
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

    const qTests = collection(db, "educators", educatorId, "my_tests");
    const unsubTests = onSnapshot(qTests, (snap) => {
      let tests = 0;
      let dpps = 0;
      snap.docs.forEach((d) => {
        const data = d.data();
        if (!data.startTime) return;
        const now = Date.now();
        const startTime = data.startTime.toMillis ? data.startTime.toMillis() : data.startTime;
        if (startTime <= now) return; // Only count upcoming (not yet started)
        if (data.endTime) {
          const endTime = data.endTime.toMillis ? data.endTime.toMillis() : data.endTime;
          if (now > endTime) return; // Skip completed
        }
        const title = (data.title || "").toLowerCase();
        if (title.includes("dpp") || title.includes("practice")) {
          dpps++;
        } else {
          tests++;
        }
      });
      setScheduledTestsCount(tests);
      setScheduledDppsCount(dpps);
    });

    return () => {
      unsubEdu();
      unsubSeats();
      unsubPools();
      unsubTests();
    };
  }, [educatorId]);

  // Resolve course names from IDs when educatorDoc changes
  useEffect(() => {
    const ids = educatorDoc?.allowedCourseIds;
    if (!ids || ids.length === 0) {
      setAllowedCourseNames([]);
      return;
    }

    getDocs(collection(db, "courses"))
      .then((snap) => {
        const names = snap.docs
          .filter((d) => ids.includes(d.id))
          .map((d) => (d.data() as any).name || d.id);
        setAllowedCourseNames(names);
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

  // Derived Plan & Seat Info
  const planName = poolPlanName || "Free Tier";
  const seatLimit = poolSeatTotal;
  const usedSeats = usedSeatsCount;
  const vacantSeats = Math.max(0, seatLimit - usedSeats);

  // Note: allowedCourseNames is now managed by the state at the top

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
            <p className="mt-1 text-sm text-white/80">Here's your coaching at a glance.</p>
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

      {/* Scheduled Assessments Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Link to="/educator/scheduled-tests" className="group block h-full">
          <Card className="flex h-full flex-col border-border/50 transition-all duration-200 hover:border-primary/40 hover:shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between pb-2">
              <div>
                <CardTitle className="text-base font-semibold transition-colors group-hover:text-primary">
                  Scheduled Tests
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upcoming and completed test schedules
                </p>
              </div>
              <div className="rounded-full bg-primary/10 p-2.5 text-primary">
                <CalendarRange className="h-5 w-5" />
              </div>
            </CardHeader>
            <CardContent className="mt-auto">
              <div className="flex items-baseline gap-2">
                <h3 className="text-3xl font-bold tracking-tight">{scheduledTestsCount}</h3>
                <span className="text-sm font-medium text-muted-foreground">Tests</span>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/educator/scheduled-dpps" className="group block h-full">
          <Card className="flex h-full flex-col border-border/50 transition-all duration-200 hover:border-primary/40 hover:shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between pb-2">
              <div>
                <CardTitle className="text-base font-semibold transition-colors group-hover:text-primary">
                  Scheduled DPPs
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Track daily practice schedules</p>
              </div>
              <div className="rounded-full bg-primary/10 p-2.5 text-primary">
                <BookOpenCheck className="h-5 w-5" />
              </div>
            </CardHeader>
            <CardContent className="mt-auto">
              <div className="flex items-baseline gap-2">
                <h3 className="text-3xl font-bold tracking-tight">{scheduledDppsCount}</h3>
                <span className="text-sm font-medium text-muted-foreground">DPPs</span>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Security Activity Feed & Active Tests */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CheatActivityFeed />
        <ActiveTestsFeed />
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
      <Card className="hidden border-border/50 md:block">
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="gap-2">
              <Link to="/educator/test-series">
                <Plus className="h-4 w-4" />
                Create Test
              </Link>
            </Button>
            <Button variant="outline" asChild className="gap-2">
              <Link to="/educator/students">
                <Users className="h-4 w-4" />
                View Learners
              </Link>
            </Button>
            <Button variant="outline" asChild className="gap-2">
              <Link to="/educator/analytics">
                <BarChart3 className="h-4 w-4" />
                View Analytics
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
