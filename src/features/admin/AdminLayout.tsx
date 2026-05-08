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
  Shield,
  ChevronLeft,
  ChevronRight,
  FileText,
  Tag,
  Layers,
  BookMarked,
  Receipt,
  Library,
} from "lucide-react";
import { Button } from "@shared/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@shared/ui/sheet";
import { Avatar, AvatarFallback } from "@shared/ui/avatar";
import { cn } from "@shared/lib/utils";
import { useAuth } from "@app/providers/AuthProvider";
import NotificationBell from "@shared/components/NotificationBell";
import AdminBroadcastModal from "./components/AdminBroadcastModal";

const sidebarItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/admin" },
  { icon: BarChart3, label: "Analytics", path: "/admin/analytics" },
  { icon: BookOpen, label: "Test Bank", path: "/admin/tests" },
  { icon: FileText, label: "Templates", path: "/admin/templates" },
  { icon: Users, label: "Educators", path: "/admin/educators" },
  { icon: Library, label: "Question Bank", path: "/admin/question-bank" },
  { icon: Layers, label: "Plans", path: "/admin/plans" },
  { icon: BookMarked, label: "Courses", path: "/admin/subjects" },
  { icon: BookOpen, label: "Content Library", path: "/admin/content" },
  { icon: Tag, label: "Coupons", path: "/admin/coupons" },
  { icon: Receipt, label: "Payment Logs", path: "/admin/payment-logs" },
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  const Sidebar = ({ mobile = false, collapsed = false }: { mobile?: boolean; collapsed?: boolean }) => (
    <div className={cn("flex flex-col h-full", mobile ? "pt-4" : "")}>
      {/* Logo */}
      <div className={cn("p-6 border-b border-border", collapsed && !mobile && "px-3")}>
        <div className={cn("flex items-center", collapsed && !mobile ? "justify-center" : "justify-between")}>
        <Link to="/admin" className={cn("flex items-center gap-3", collapsed && !mobile && "justify-center")}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
            <Shield className="h-6 w-6 text-white" />
          </div>
          {!collapsed && (
          <div>
            <h1 className="font-bold text-lg text-foreground">Admin Panel</h1>
            <p className="text-xs text-muted-foreground">Internal</p>
          </div>
          )}
        </Link>
        {!mobile && (
          <Button variant="ghost" size="icon" onClick={() => setSidebarCollapsed((prev) => !prev)}>
            {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </Button>
        )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {sidebarItems.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path !== "/admin" && location.pathname.startsWith(item.path));

          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => mobile && setMobileMenuOpen(false)}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                collapsed && !mobile && "justify-center px-2",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              title={collapsed && !mobile ? item.label : undefined}
            >
              <item.icon className="h-5 w-5" />
              {(!collapsed || mobile) && item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <Button
          variant="ghost"
          className={cn("w-full gap-3 text-muted-foreground hover:text-destructive", collapsed && !mobile ? "justify-center px-0" : "justify-start")}
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
    <div className="min-h-screen h-[100dvh] bg-background">
      {/* Desktop Sidebar */}
      <aside className={cn("hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:flex-col border-r border-border bg-card transition-all duration-300", sidebarCollapsed ? "lg:w-20" : "lg:w-64")}>
        <Sidebar collapsed={sidebarCollapsed} />
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 border-b border-border bg-card/95 backdrop-blur-sm z-50 flex items-center justify-between px-4">
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
            <Shield className="h-6 w-6 text-primary" />
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
            <AvatarFallback className="bg-primary/10 text-primary text-xs">AD</AvatarFallback>
          </Avatar>
        </div>
      </header>

      {/* Main Content */}
      <main className={cn("transition-all duration-300", sidebarCollapsed ? "lg:pl-20" : "lg:pl-64")}>
        {/* Desktop Top Bar */}
        <div className="hidden lg:flex h-16 items-center justify-between border-b border-border bg-card/50 backdrop-blur-sm px-6 sticky top-0 z-40">
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

