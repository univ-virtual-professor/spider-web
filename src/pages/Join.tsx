import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { auth } from "@shared/lib/firebase";
import { buildTenantUrl } from "@shared/lib/tenant";
import { toast } from "sonner";
import { Loader2, GraduationCap } from "lucide-react";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@shared/ui/card";

const API = import.meta.env.VITE_MONKEY_KING_API_URL;

type InviteInfo = {
  batch_name: string;
  educator_name: string;
  prefilled_email: string | null;
  prefilled_name: string | null;
};

export default function Join() {
  const { token } = useParams<{ token: string }>();
  const nav = useNavigate();

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [inviteError, setInviteError] = useState("");
  const [loadingInfo, setLoadingInfo] = useState(true);

  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setInviteError("Invalid invite link.");
      setLoadingInfo(false);
      return;
    }
    fetch(`${API}/api/invites/${token}`)
      .then((r) =>
        r.ok ? r.json() : r.json().then((d) => Promise.reject(d.detail || "Invalid link"))
      )
      .then((data: InviteInfo) => {
        setInfo(data);
        if (data.prefilled_email) setEmail(data.prefilled_email);
        if (data.prefilled_name) setName(data.prefilled_name);
      })
      .catch((e) =>
        setInviteError(typeof e === "string" ? e : "Invite link not found or has expired.")
      )
      .finally(() => setLoadingInfo(false));
  }, [token]);

  // If user is already logged in, accept invite immediately without showing auth form
  useEffect(() => {
    if (!token) return;
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      if (!user) return;
      setSubmitting(true);
      try {
        const idToken = await user.getIdToken();
        const res = await fetch(`${API}/api/invites/${token}/accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({
            name: user.displayName || user.email || "",
            email: user.email || "",
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (res.status === 403 && (err.detail || "").includes("Educator")) {
            toast.info("You're logged in as an educator. Share this link with your students.");
            nav("/educator/dashboard");
            return;
          }
          throw new Error(err.detail || "Enrollment failed");
        }
        const result = await res.json().catch(() => ({}));
        toast.success("You've been enrolled successfully.");
        window.location.href = buildTenantUrl(result.tenant_slug || "", "/student/dashboard");
      } catch (e: any) {
        toast.error(e?.message || "Enrollment failed");
        setSubmitting(false);
      }
    });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !info) return;
    if (!name.trim() || !email.trim() || !password.trim()) {
      toast.error("All fields are required");
      return;
    }
    setSubmitting(true);
    try {
      let idToken: string;

      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
        idToken = await cred.user.getIdToken();
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        idToken = await cred.user.getIdToken();
      }

      const res = await fetch(`${API}/api/invites/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ name, email }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Registration failed");
      }

      const result = await res.json().catch(() => ({}));
      toast.success("Welcome! You've been enrolled successfully.");
      window.location.href = buildTenantUrl(result.tenant_slug || "", "/student/dashboard");
    } catch (e: any) {
      const msg = e?.message || "Something went wrong";
      if (msg.includes("email-already-in-use") || msg.includes("EMAIL_EXISTS")) {
        toast.error("Email already registered — sign in instead.");
        setMode("signin");
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingInfo) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (inviteError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Invite Unavailable</CardTitle>
            <CardDescription>{inviteError}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <GraduationCap className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Join {info?.educator_name}</CardTitle>
          <CardDescription>
            You've been invited to <b>{info?.batch_name}</b>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1">
                <Label>Full Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                />
              </div>
            )}
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                readOnly={!!info?.prefilled_email && mode === "signup"}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "signup" ? "Create Account & Enroll" : "Sign In & Enroll"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === "signup" ? (
              <>
                Already have an account?{" "}
                <button
                  className="text-primary underline underline-offset-2"
                  onClick={() => setMode("signin")}
                >
                  Sign in instead
                </button>
              </>
            ) : (
              <>
                New here?{" "}
                <button
                  className="text-primary underline underline-offset-2"
                  onClick={() => setMode("signup")}
                >
                  Create an account
                </button>
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
