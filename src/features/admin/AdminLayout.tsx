import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@shared/lib/firebase";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  BookOpen,
  Users,
  BarChart3,
  LogOut,
  Menu,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  FileText,
  Tag,
  Layers,
  BookMarked,
  Receipt,
  Library,
  LayoutList,
  ClipboardList,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@shared/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@shared/ui/sheet";
import { Avatar, AvatarFallback } from "@shared/ui/avatar";
import { cn } from "@shared/lib/utils";
import { useAuth } from "@app/providers/AuthProvider";
import NotificationBell from "@shared/components/NotificationBell";
import AdminBroadcastModal from "./components/AdminBroadcastModal";

const sidebarGroups = [
  {
    label: null,
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/admin" },
      { icon: BarChart3, label: "Analytics", path: "/admin/analytics" },
      { icon: Users, label: "Educators", path: "/admin/educators" },
      { icon: ClipboardList, label: "Question Papers", path: "/admin/question-paper-requests" },
      { icon: AlertTriangle, label: "Reported Questions", path: "/admin/reported-questions" },
      { icon: BookMarked, label: "Courses", path: "/admin/subjects" },
      { icon: ShieldCheck, label: "Employee Roles", path: "/admin/roles" },
    ],
  },
  {
    label: "Tests",
    items: [
      { icon: BookOpen, label: "Test Bank", path: "/admin/tests" },
      { icon: FileText, label: "Templates", path: "/admin/templates" },
      { icon: Library, label: "Question Bank", path: "/admin/question-bank" },
    ],
  },
  {
    label: "Content",
    items: [
      { icon: BookOpen, label: "Content Library", path: "/admin/content" },
      { icon: LayoutList, label: "Content Types", path: "/admin/content-types" },
    ],
  },
  {
    label: "Finance",
    items: [
      { icon: Layers, label: "Plans", path: "/admin/plans" },
      { icon: Tag, label: "Coupons", path: "/admin/coupons" },
      { icon: Receipt, label: "Payment Logs", path: "/admin/payment-logs" },
    ],
  },
];

const ThemeToggle = () => {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    document.documentElement.classList.toggle("dark", newIsDark);
    localStorage.setItem("theme", newIsDark ? "dark" : "light");
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    }
  }, []);

  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme} className="rounded-full">
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
};

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const { profile, loading } = useAuth();

  // Protect admin routes
  useEffect(() => {
    if (!loading && profile?.role !== "ADMIN") {
      navigate("/admin/login");
    }
  }, [profile, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-primary"></div>
      </div>
    );
  }

  const Sidebar = ({
    mobile = false,
    collapsed = false,
  }: {
    mobile?: boolean;
    collapsed?: boolean;
  }) => (
    <div className={cn("flex h-full flex-col", mobile ? "pt-4" : "")}>
      {/* Logo */}
      <div className={cn("border-b border-border p-6", collapsed && !mobile && "px-3")}>
        <div
          className={cn(
            "flex items-center",
            collapsed && !mobile ? "justify-center" : "justify-between"
          )}
        >
          <Link
            to="/admin"
            className={cn("flex items-center gap-3", collapsed && !mobile && "justify-center")}
          >
            <div className="flex items-center gap-3">
              <img
                src="/logo-compact.png"
                alt="UNIV.LIVE"
                className="h-10 w-10 flex-shrink-0 object-contain"
              />
              {(!collapsed || mobile) && (
                <div className="min-w-0 bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text">
                  <h1 className="bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-sm font-bold leading-tight tracking-tight text-transparent">
                    Admin Panel
                  </h1>
                  <p className="text-[9px] leading-tight text-muted-foreground">
                    with great power comes great responsibility
                  </p>
                </div>
              )}
            </div>
          </Link>
          {!mobile && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
            >
              {collapsed ? (
                <ChevronRight className="h-5 w-5" />
              ) : (
                <ChevronLeft className="h-5 w-5" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-4 overflow-y-auto p-4">
        {sidebarGroups.map((group, gi) => (
          <div key={gi} className="space-y-1">
            {group.label && (!collapsed || mobile) && (
              <p className="px-4 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const isActive =
                location.pathname === item.path ||
                (item.path !== "/admin" && location.pathname.startsWith(item.path + "/"));
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => mobile && setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200",
                    collapsed && !mobile && "justify-center px-2",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  title={collapsed && !mobile ? item.label : undefined}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {(!collapsed || mobile) && item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-4">
        <Button
          variant="ghost"
          className={cn(
            "w-full gap-3 text-muted-foreground hover:text-destructive",
            collapsed && !mobile ? "justify-center px-0" : "justify-start"
          )}
          onClick={() => signOut(auth).then(() => navigate("/admin/login"))}
          title={collapsed && !mobile ? "Logout" : undefined}
        >
          <LogOut className="h-5 w-5" />
          {(!collapsed || mobile) && "Logout"}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="h-[100dvh] min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden border-r border-border bg-card transition-all duration-300 lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:flex-col",
          sidebarCollapsed ? "lg:w-20" : "lg:w-64"
        )}
      >
        <Sidebar collapsed={sidebarCollapsed} />
      </aside>

      {/* Mobile Header */}
      <header className="fixed left-0 right-0 top-0 z-50 flex h-16 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur-sm lg:hidden">
        <div className="flex items-center gap-3">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <Sidebar mobile />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <img src="/logo-compact.png" alt="Admin" className="h-6 w-6 object-contain" />
            <span className="font-bold text-foreground">Admin</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {profile?.uid && (
            <NotificationBell
              uid={profile.uid}
              canBroadcast
              onBroadcast={() => setBroadcastOpen(true)}
            />
          )}
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-xs text-primary">AD</AvatarFallback>
          </Avatar>
        </div>
      </header>

      {/* Main Content */}
      <main
        className={cn("transition-all duration-300", sidebarCollapsed ? "lg:pl-20" : "lg:pl-64")}
      >
        {/* Desktop Top Bar */}
        <div className="sticky top-0 z-40 hidden h-16 items-center justify-between border-b border-border bg-card/50 px-6 backdrop-blur-sm lg:flex">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {profile?.uid && (
              <NotificationBell
                uid={profile.uid}
                canBroadcast
                onBroadcast={() => setBroadcastOpen(true)}
              />
            )}
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary/10 text-primary">AD</AvatarFallback>
              </Avatar>
              <div className="text-sm">
                <p className="font-medium text-foreground">Admin</p>
                <p className="text-xs text-muted-foreground">Administrator</p>
              </div>
            </div>
          </div>
        </div>

        {/* Page Content */}
        <div className="pt-16 lg:pt-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="p-4 md:p-6"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <AdminBroadcastModal open={broadcastOpen} onOpenChange={setBroadcastOpen} />
    </div>
  );
}
