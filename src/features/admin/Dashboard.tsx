// pages/admin/Dashboard.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  GraduationCap,
  BookOpen,
  BarChart3,
  Plus,
  Receipt,
  Activity,
  IndianRupee,
  RefreshCcw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Button } from "@shared/ui/button";
import { toast } from "sonner";

import { useAuth } from "@app/providers/AuthProvider";
import { db } from "@shared/lib/firebase";
import { collection, getCountFromServer, query, where } from "firebase/firestore";
import { cn } from "@shared/lib/utils";

const API = import.meta.env.VITE_MONKEY_KING_API_URL;
const ADMIN_KEY = import.meta.env.VITE_MONKEY_KING_ADMIN_KEY;

type Stats = {
  totalEducators: number;
  totalStudents: number;
  totalAttempts: number;
  activeTrials: number;
  totalRevenue: number;
  revenueThisMonth: number;
};

function fmtRevenue(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function AdminDashboard() {
  const { firebaseUser, loading: authLoading, role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    totalEducators: 0,
    totalStudents: 0,
    totalAttempts: 0,
    activeTrials: 0,
    totalRevenue: 0,
    revenueThisMonth: 0,
  });

  const canView = useMemo(() => {
    return !authLoading && !!firebaseUser?.uid && role === "ADMIN";
  }, [authLoading, firebaseUser?.uid, role]);

  async function loadStats() {
    setLoading(true);
    try {
      const educatorsQ = query(collection(db, "users"), where("role", "==", "EDUCATOR"));
      const studentsQ = query(collection(db, "users"), where("role", "==", "STUDENT"));
      const attemptsQ = query(collection(db, "attempts"));
      const activeTrialsQ = query(collection(db, "educators"), where("trialSeats", ">", 0));

      const [educatorsCnt, studentsCnt, attemptsCnt, trialsCnt] = await Promise.all([
        getCountFromServer(educatorsQ),
        getCountFromServer(studentsQ),
        getCountFromServer(attemptsQ),
        getCountFromServer(activeTrialsQ),
      ]);

      let totalRevenue = 0;
      let revenueThisMonth = 0;
      try {
        const res = await fetch(`${API}/api/payment/admin/stats`, {
          headers: { Authorization: `Bearer ${ADMIN_KEY}` },
        });
        if (res.ok) {
          const data = await res.json();
          totalRevenue = data.total_revenue ?? 0;
          revenueThisMonth = data.revenue_this_month ?? 0;
        }
      } catch {
        // revenue is a nice-to-have — silently skip on error
      }

      setStats({
        totalEducators: educatorsCnt.data().count,
        totalStudents: studentsCnt.data().count,
        totalAttempts: attemptsCnt.data().count,
        activeTrials: trialsCnt.data().count,
        totalRevenue,
        revenueThisMonth,
      });
    } catch (e) {
      console.error(e);
      toast.error("Failed to load admin stats.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canView) return;
    loadStats();
  }, [canView]);

  if (authLoading) {
    return <div className="py-12 text-center text-muted-foreground">Loading…</div>;
  }

  if (!firebaseUser?.uid) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
        <p className="text-muted-foreground">You must be logged in.</p>
        <Button asChild>
          <Link to="/login?role=admin">Go to Admin Login</Link>
        </Button>
      </div>
    );
  }

  if (role !== "ADMIN") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
        <p className="text-muted-foreground">You do not have access to this page.</p>
      </div>
    );
  }

  const statCards = [
    {
      title: "Total Revenue",
      value: loading ? "—" : fmtRevenue(stats.totalRevenue),
      subtitle: loading ? "" : `This month: ${fmtRevenue(stats.revenueThisMonth)}`,
      icon: IndianRupee,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
    },
    {
      title: "Total Educators",
      value: loading ? "—" : stats.totalEducators.toLocaleString(),
      icon: Users,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Total Students",
      value: loading ? "—" : stats.totalStudents.toLocaleString(),
      icon: GraduationCap,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Tests Taken",
      value: loading ? "—" : stats.totalAttempts.toLocaleString(),
      icon: BookOpen,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "Active Trials",
      value: loading ? "—" : stats.activeTrials.toLocaleString(),
      subtitle: "Educators with trial seats",
      icon: Activity,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      href: "/admin/trials",
    },
  ];

  const quickActions = [
    { label: "Create Test", icon: Plus, path: "/admin/tests/new", variant: "default" as const },
    {
      label: "Manage Educators",
      icon: Users,
      path: "/admin/educators",
      variant: "outline" as const,
    },
    {
      label: "Payment Logs",
      icon: Receipt,
      path: "/admin/payment-logs",
      variant: "outline" as const,
    },
    {
      label: "View Analytics",
      icon: BarChart3,
      path: "/admin/analytics",
      variant: "outline" as const,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">Admin Dashboard</h1>
          <p className="mt-1 text-muted-foreground">Platform overview</p>
        </div>
        <Button variant="outline" className="gap-2 self-start" onClick={loadStats}>
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {statCards.map((stat) => {
          const cardContent = (
            <CardContent className="p-6">
              <div
                className={`h-10 w-10 rounded-xl ${stat.bgColor} mb-4 flex items-center justify-center`}
              >
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{stat.title}</p>
              {stat.subtitle && (
                <p className="mt-1 text-xs text-muted-foreground/70">{stat.subtitle}</p>
              )}
            </CardContent>
          );
          return stat.href ? (
            <Link key={stat.title} to={stat.href}>
              <Card
                className={cn(
                  "cursor-pointer border-border/50 transition-colors hover:border-orange-500/50 hover:bg-orange-500/5"
                )}
              >
                {cardContent}
              </Card>
            </Link>
          ) : (
            <Card key={stat.title} className="border-border/50">
              {cardContent}
            </Card>
          );
        })}
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {quickActions.map((action) => (
              <Button key={action.label} variant={action.variant} asChild className="gap-2">
                <Link to={action.path}>
                  <action.icon className="h-4 w-4" />
                  {action.label}
                </Link>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
