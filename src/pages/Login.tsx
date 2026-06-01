import { useMemo, useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Loader2, Home, Mail } from "lucide-react";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@shared/lib/firebase";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { toast } from "sonner";
import { useTenant } from "@app/providers/TenantProvider";
import { useAuth } from "@app/providers/AuthProvider";
import { registerStudentForTenant } from "@shared/lib/studentRegistration";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";
import {
  generateSessionId,
  setLocalSessionId,
  syncSessionWithFirestore,
} from "@shared/lib/session";

type RoleUI = "student" | "educator";

export default function Login() {
  const [searchParams] = useSearchParams();
  const nav = useNavigate();
  const { isTenantDomain, tenantSlug, loading: tenantLoading } = useTenant();
  const { firebaseUser, profile, loading: authLoading, refreshProfile } = useAuth();

  const roleParam = (searchParams.get("role") || "").toLowerCase();
  const initialRole: RoleUI = roleParam === "educator" ? "educator" : "student";

  const [role, setRole] = useState<RoleUI>(initialRole);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [sendingReset, setSendingReset] = useState(false);

  // Default role: educator on main domain, student on tenant domain
  useEffect(() => {
    if (tenantLoading) return;
    if (!roleParam) {
      setRole(isTenantDomain ? "student" : "educator");
    }
  }, [isTenantDomain, tenantLoading, roleParam]);

  // Auto-redirect if already authenticated
  useEffect(() => {
    if (authLoading || tenantLoading) return;
    if (!firebaseUser || !profile) return;

    const r = String(profile.role || "").toUpperCase();
    if (r === "ADMIN") {
      nav("/admin", { replace: true });
    } else if (r === "EDUCATOR") {
      nav("/educator", { replace: true });
    } else if (r === "STUDENT") {
      nav("/student", { replace: true });
    }
  }, [authLoading, tenantLoading, firebaseUser, profile, nav]);

  const title = useMemo(() => {
    if (tenantLoading) return "Loading…";
    if (isTenantDomain && role === "educator") return "Educator Login";
    if (isTenantDomain) return `Login to ${tenantSlug || "your coaching"}`;
    return role === "educator" ? "Educator Login" : "Student Login";
  }, [tenantLoading, isTenantDomain, tenantSlug, role]);

  async function handleForgotPassword() {
    const targetEmail = resetEmail.trim();

    if (!targetEmail) {
      toast.error("Please enter your email address.");
      return;
    }

    setSendingReset(true);

    try {
      await sendPasswordResetEmail(auth, targetEmail);
      toast.success("Password reset link sent to your email.");
      setForgotOpen(false);
    } catch (error: any) {
      console.error(error);

      let msg = "Failed to send reset email.";
      if (error?.code === "auth/invalid-email") msg = "Please enter a valid email address.";
      else if (error?.code === "auth/too-many-requests")
        msg = "Too many attempts. Please try again later.";

      toast.error(msg);
    } finally {
      setSendingReset(false);
    }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);

      // load profile doc
      const snap = await getDoc(doc(db, "users", cred.user.uid));
      const data: any = snap.exists() ? snap.data() : {};

      const roleDb = String(data?.role || "STUDENT").toUpperCase();
      const statusDb = String(data?.status || "active").toLowerCase();

      if (statusDb === "suspended") {
        toast.error("Your account has been suspended. Please contact support.");
        await auth.signOut();
        return;
      }

      const enrolledTenants: string[] = Array.isArray(data?.enrolledTenants)
        ? data.enrolledTenants
        : typeof data?.tenantSlug === "string"
          ? [data.tenantSlug]
          : [];

      if (roleDb === "ADMIN") {
        toast.success("Welcome back!");
        await refreshProfile();
        nav("/admin", { replace: true });
        return;
      }

      if (roleDb === "EDUCATOR") {
        if (isTenantDomain && tenantSlug && data?.tenantSlug !== tenantSlug) {
          toast.error("This account is not registered for this coaching institute.");
          await auth.signOut();
          return;
        }
        toast.success("Welcome back!");
        await refreshProfile();
        nav("/educator", { replace: true });
        return;
      }

      // ---- student on tenant domain ----
      if (isTenantDomain) {
        if (!tenantSlug) {
          toast.error("Invalid coaching URL (tenant slug missing).");
          await auth.signOut();
          return;
        }

        const isEnrolled =
          enrolledTenants.includes(tenantSlug) ||
          (typeof data?.tenantSlug === "string" && data.tenantSlug === tenantSlug);

        if (!isEnrolled) {
          toast.error(
            "You are not enrolled in this coaching. Please signup on this coaching URL first."
          );
          await auth.signOut();
          return;
        }

        const token = await cred.user.getIdToken();
        try {
          await registerStudentForTenant(token, tenantSlug);
        } catch (apiErr: any) {
          console.error("[Login] Sync error:", apiErr);
        }

        // --- Single Session Logic for Students ---
        // Set localStorage FIRST so onSnapshot never sees a local/remote mismatch.
        const sid = generateSessionId();
        setLocalSessionId(sid);
        await syncSessionWithFirestore(cred.user.uid, sid);

        toast.success("Welcome back!");
        await refreshProfile();
        nav("/student", { replace: true });
        return;
      }

      // ---- student on main domain: send them to their coaching URL ----
      toast.error("Students must login from their coaching URL.");
      await auth.signOut();
      return;
    } catch (error: any) {
      console.error(error);
      let msg = "Failed to login";
      if (error.code === "auth/invalid-credential") msg = "Invalid email or password";
      else if (error.code === "auth/user-disabled") msg = "This account has been disabled.";
      else if (error.code === "auth/too-many-requests")
        msg = "Too many failed attempts. Try again later.";
      else if (error.code === "auth/network-request-failed")
        msg = "Network error. Check your connection.";
      else msg = error.message || msg;
      toast.error(msg);
      await auth.signOut().catch(() => {});
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background lg:grid lg:grid-cols-2">
      {/* LEFT COLUMN - FORM */}
      <div className="relative flex min-h-screen flex-col p-6 lg:p-12">
        {/* Header / Nav */}
        <div className="mb-8 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Home className="h-4 w-4" />
            Return to Home
          </Link>
        </div>

        {/* Form Wrapper */}
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md space-y-8">
            <div className="space-y-3">
              <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
              <p className="text-muted-foreground">
                Welcome back! Please enter your details to sign in.
              </p>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Continue with email
                </span>
              </div>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  className="h-11"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                />
              </div>

              <div className="space-y-2">
                <Label>Password</Label>
                <div className="relative">
                  <Input
                    className="h-11"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={show ? "text" : "password"}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(email);
                      setForgotOpen(true);
                    }}
                    className="text-sm font-medium text-[#4F46E5] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>

              <Button
                disabled={loading || authLoading}
                className="h-11 w-full bg-[#4F46E5] text-base text-white transition-colors hover:bg-[#4338CA]"
              >
                {loading || authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
              </Button>
            </form>

            {role === "student" && (
              <div className="relative z-10 pb-8 pt-4 text-center text-sm text-muted-foreground">
                Don’t have an account?{" "}
                <Link
                  className="font-medium text-[#4F46E5] hover:underline"
                  to={(() => {
                    const tenant = searchParams.get("tenant");
                    return tenant ? `/signup?tenant=${tenant}` : "/signup";
                  })()}
                >
                  Create Account
                </Link>
              </div>
            )}

            {isTenantDomain && role === "student" && (
              <div className="text-center text-xs text-muted-foreground/60">
                Are you the educator?{" "}
                <button
                  type="button"
                  onClick={() => setRole("educator")}
                  className="underline underline-offset-2 transition-colors hover:text-muted-foreground"
                >
                  <span className="font-bold text-black">Sign in here </span>
                </button>
              </div>
            )}

            {isTenantDomain && role === "educator" && (
              <div className="text-center text-xs text-muted-foreground/60">
                <button
                  type="button"
                  onClick={() => setRole("student")}
                  className="underline underline-offset-2 transition-colors hover:text-muted-foreground"
                >
                  ← Back to <span className="font-bold text-black">student login</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN - IMAGE (Hidden on Mobile) */}
      <div className="relative hidden flex-col items-center justify-center overflow-hidden bg-[#FFF5EE] p-12 lg:flex">
        {/* Soft blur background blobs for extra aesthetics */}
        <div className="absolute left-0 top-0 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-200/50 blur-[100px]" />
        <div className="absolute bottom-0 right-0 h-[500px] w-[500px] translate-x-1/3 translate-y-1/3 rounded-full bg-pink-200/40 blur-[100px]" />

        <div className="relative aspect-[4/5] w-full max-w-xl overflow-hidden rounded-[2rem] border-8 border-white/50 shadow-2xl">
          <img
            src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1000&auto=format&fit=crop"
            alt="Educator Workspace"
            className="h-full w-full object-cover"
          />
        </div>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-[#4F46E5]" />
              Reset your password
            </DialogTitle>
            <DialogDescription>
              Enter your email address and we’ll send you a password reset link.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="reset-email">Email</Label>
            <Input
              id="reset-email"
              type="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="you@email.com"
              className="h-11"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setForgotOpen(false)}
              disabled={sendingReset}
            >
              Cancel
            </Button>

            <Button
              type="button"
              onClick={handleForgotPassword}
              disabled={sendingReset}
              className="bg-[#4F46E5] text-white hover:bg-[#4338CA]"
            >
              {sendingReset ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
