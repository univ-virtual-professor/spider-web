import { useEffect, useMemo, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  FileText,
  History,
  Trophy,
  LifeBuoy,
  Settings,
  LogOut,
  Menu,
  X,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Bot,
} from "lucide-react";
import { Button } from "@shared/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Badge } from "@shared/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@shared/ui/dropdown-menu";
import { cn } from "@shared/lib/utils";

import { useAuth } from "@app/providers/AuthProvider";
import { useTenant } from "@app/providers/TenantProvider";
import { db } from "@shared/lib/firebase";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { getAuth, signOut } from "firebase/auth";
import ImpersonationBanner from "@shared/components/ImpersonationBanner";
import NotificationBell from "@shared/components/NotificationBell";

type UserDoc = {
  displayName?: string;
  name?: string;
  email?: string;
  phone?: string;
  photoURL?: string;
  avatar?: string;
  batch?: string;
  batchName?: string;
  coachingName?: string;
};

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "S";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function safeStr(v: any, fallback = "") {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

export default function StudentLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const { tenant, tenantSlug, loading: tenantLoading } = useTenant();

  const uid = firebaseUser?.uid || null;
  const educatorId = tenant?.educatorId || profile?.educatorId || null;

  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [unreadThreadsCount, setUnreadThreadsCount] = useState(0);

  // Live user profile from users/{uid}
  useEffect(() => {
    if (!uid) {
      setUserDoc(null);
      return;
    }

    const ref = doc(db, "users", uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = (snap.exists() ? (snap.data() as UserDoc) : null) as UserDoc | null;
        setUserDoc(data);
      },
      (err) => {
        console.error(err);
        setUserDoc(null);
      }
    );

    return () => unsub();
  }, [uid]);

  // Live unread badge for messages (count threads with unreadCountStudent > 0)
  useEffect(() => {
    if (!uid || !educatorId) {
      setUnreadThreadsCount(0);
      return;
    }

    const qUnread = query(
      collection(db, "support_threads"),
      where("studentId", "==", uid),
      where("educatorId", "==", educatorId),
      where("unreadCountStudent", ">", 0)
    );

    const unsub = onSnapshot(
      qUnread,
      (snap) => {
        setUnreadThreadsCount(snap.size);
      },
      (err) => {
        console.error(err);
        setUnreadThreadsCount(0);
      }
    );

    return () => unsub();
  }, [uid, educatorId]);

  const displayName = useMemo(() => {
    return (
      safeStr(userDoc?.displayName) ||
      safeStr(userDoc?.name) ||
      safeStr(profile?.displayName) ||
      safeStr(firebaseUser?.displayName) ||
      "Student"
    );
  }, [userDoc, profile, firebaseUser]);

  const firstName = useMemo(() => displayName.split(" ")[0] || "Student", [displayName]);

  const displayEmail = useMemo(() => {
    return (
      safeStr(firebaseUser?.email) || safeStr(userDoc?.email) || safeStr(profile?.email) || "—"
    );
  }, [firebaseUser, userDoc, profile]);

  const avatarUrl = useMemo(() => {
    return (
      safeStr(userDoc?.photoURL) ||
      safeStr(userDoc?.avatar) ||
      safeStr(firebaseUser?.photoURL) ||
      ""
    );
  }, [userDoc, firebaseUser, profile]);

  const batchLabel = useMemo(() => {
    return safeStr(userDoc?.batchName) || safeStr(userDoc?.batch) || "Batch";
  }, [userDoc, profile, tenant]);

  const sidebarItems = useMemo(
    () => [
      { icon: LayoutDashboard, label: "Dashboard", href: "/student/dashboard" },
      { icon: FileText, label: "Tests", href: "/student/tests" },
      { icon: History, label: "My Attempts", href: "/student/attempts" },
      { icon: BookOpen, label: "Content", href: "/student/content" },
      { icon: Bot, label: "AI Tutor", href: "/student/chatbot" },
      { icon: Trophy, label: "Rankings", href: "/student/rankings" },
    ],
    []
  );

  const isActive = (href: string) => {
    if (href === "/student/tests") return location.pathname.startsWith("/student/tests");
    if (href === "/student/attempts") {
      return (
        location.pathname.startsWith("/student/attempts") ||
        location.pathname.startsWith("/student/results")
      );
    }
    return location.pathname === href;
  };

  const handleLogout = async () => {
    try {
      const auth = getAuth();
      await signOut(auth);
      navigate("/login"); // adjust if your route differs
    } catch (e) {
      console.error(e);
    }
  };

  if (authLoading || tenantLoading) {
    return <div className="py-12 text-center text-muted-foreground">Loading...</div>;
  }

  // Root fixed height + overflow hidden => only main scrolls
  return (
    <div className="flex h-[100dvh] min-h-screen flex-col overflow-hidden bg-background">
      <ImpersonationBanner />
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile Overlay */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Sidebar: sticky + no scroll */}
        <aside
          className={cn(
            "fixed left-0 top-0 z-50 h-[100dvh] w-64 border-r border-border bg-card transition-all duration-300 lg:static lg:translate-x-0",
            sidebarCollapsed ? "lg:w-20" : "lg:w-64",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex h-full flex-col overflow-hidden">
            {/* Logo Section */}
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
              <div className="flex items-center gap-2">
                <img
                  src={sidebarCollapsed ? "/logo-compact.png" : "/logo.png"}
                  alt="UNIV.LIVE"
                  className={sidebarCollapsed ? "h-10 w-10 object-contain" : "h-10 w-auto"}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="hidden lg:inline-flex"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
              >
                {sidebarCollapsed ? (
                  <ChevronRight className="h-5 w-5" />
                ) : (
                  <ChevronLeft className="h-5 w-5" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Student Info */}
            <div
              className={cn("shrink-0 border-b border-border p-4", sidebarCollapsed && "lg:hidden")}
            >
              <div className="flex items-center gap-3 rounded-xl bg-pastel-mint p-3">
                <Avatar className="h-10 w-10 border-2 border-primary/20">
                  <AvatarImage src={avatarUrl} />
                  <AvatarFallback>{initials(displayName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{batchLabel}</p>
                </div>
              </div>
            </div>

            {/* Navigation (no scroll) */}
            <nav className="shrink-0 space-y-1 p-4">
              {sidebarItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      sidebarCollapsed && "lg:justify-center lg:px-2",
                      active
                        ? "text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    {active && (
                      <motion.div
                        layoutId="studentActiveTab"
                        className="gradient-bg absolute inset-0 rounded-xl"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <item.icon className={cn("relative z-10 h-5 w-5", active && "text-white")} />
                    {!sidebarCollapsed && <span className="relative z-10">{item.label}</span>}
                    {item.badge != null && (
                      <Badge
                        variant="secondary"
                        className={cn(
                          "relative z-10 ml-auto text-xs",
                          active && "bg-white/20 text-white",
                          sidebarCollapsed && "lg:hidden"
                        )}
                      >
                        {item.badge}
                      </Badge>
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="flex-1" />

            {/* Logout */}
            <div className="shrink-0 border-t border-border p-4">
              <Button
                variant="ghost"
                className={cn(
                  "w-full rounded-xl text-muted-foreground hover:text-destructive",
                  sidebarCollapsed ? "justify-center px-0" : "justify-start"
                )}
                onClick={handleLogout}
                title={sidebarCollapsed ? "Logout" : undefined}
              >
                <LogOut className={cn("h-5 w-5", !sidebarCollapsed && "mr-3")} />
                {!sidebarCollapsed && "Logout"}
              </Button>
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top Navbar */}
          <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>

              {/* Breadcrumb */}
              <div className="hidden items-center gap-2 text-sm sm:flex">
                <span className="text-muted-foreground">Student</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium capitalize text-foreground">
                  {location.pathname.split("/").pop()?.replace("-", " ") || "Dashboard"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              {/* Theme Toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="rounded-xl text-muted-foreground hover:text-foreground"
              >
                {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>

              {/* Settings */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/student/settings")}
                title="Settings"
                className="text-muted-foreground hover:text-foreground"
              >
                <Settings className="h-5 w-5" />
              </Button>

              {/* Notifications */}
              {profile?.uid && (
                <NotificationBell
                  uid={profile.uid}
                  supportThreadCount={unreadThreadsCount}
                  supportThreadLink="/student/messages"
                />
              )}

              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 rounded-xl px-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={avatarUrl} />
                      <AvatarFallback>{initials(displayName)}</AvatarFallback>
                    </Avatar>
                    <span className="hidden text-sm font-medium sm:block">{firstName}</span>
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="rounded-xl">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span>{displayName}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {displayEmail}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link
                      to="/student/messages"
                      className="flex w-full items-center justify-between"
                    >
                      <div className="flex items-center">
                        <LifeBuoy className="mr-2 h-4 w-4" />
                        Help
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* ONLY this scrolls */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-6">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Outlet />
            </motion.div>
          </main>
        </div>
      </div>
    </div>
  );
}
