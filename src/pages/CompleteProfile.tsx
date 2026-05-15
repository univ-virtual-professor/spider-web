import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Home, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { auth, db } from "@shared/lib/firebase";
import { onAuthStateChanged, updateProfile } from "firebase/auth";
import { arrayUnion, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { useTenant } from "@app/providers/TenantProvider";
import { buildTenantUrl } from "@shared/lib/tenant";

type RoleUI = "student" | "educator";

function normSlug(raw: string) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function studentRedirectUrl(tenantSlug: string) {
  return buildTenantUrl(tenantSlug, "/student");
}

export default function CompleteProfile() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const { isTenantDomain, tenantSlug, tenant, loading: tenantLoading } = useTenant();

  const roleParam = (searchParams.get("role") || "").toLowerCase();
  const tenantParam = normSlug(searchParams.get("tenant") || "");

  // If you're on tenant domain, role must be student
  const effectiveRole: RoleUI = isTenantDomain
    ? "student"
    : roleParam === "student"
      ? "student"
      : "educator";

  const effectiveTenantSlug = isTenantDomain ? tenantSlug || "" : tenantParam;

  const [authReady, setAuthReady] = useState(false);
  const [uid, setUid] = useState<string>("");
  const [email, setEmail] = useState("");
  const [photoURL, setPhotoURL] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [coachingName, setCoachingName] = useState("");
  const [phone, setPhone] = useState("");
  const [desiredSlug, setDesiredSlug] = useState("");

  const [saving, setSaving] = useState(false);

  const title = useMemo(() => {
    if (tenantLoading) return "Loading…";
    if (effectiveRole === "student") return "Complete Student Profile";
    return "Complete Educator Profile";
  }, [tenantLoading, effectiveRole]);

  async function callRegisterStudent(token: string, tSlug: string) {
    const res = await fetch("/api/tenant/register-student", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tenantSlug: tSlug }),
    });

    if (!res.ok) {
      const contentType = String(res.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("application/json")) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data?.error || `Failed to register student for this tenant (HTTP ${res.status})`
        );
      }
      const text = (await res.text().catch(() => "")).trim();
      throw new Error(
        text
          ? `Failed to register student for this tenant (HTTP ${res.status}): ${text.slice(0, 160)}`
          : `Failed to register student for this tenant (HTTP ${res.status})`
      );
    }
  }

  async function checkSlugAvailable(slug: string, myUid: string) {
    const s = await getDoc(doc(db, "tenants", slug));
    if (!s.exists()) return true;
    // allow if it's already mine
    const existingEducatorId = String(s.data()?.educatorId || "");
    return existingEducatorId === myUid;
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setAuthReady(true);
        toast.error("Please login first.");
        nav("/login", { replace: true });
        return;
      }
      setAuthReady(true);
      setUid(u.uid);
      setEmail(u.email || "");
      setPhotoURL(u.photoURL || null);
      setName(u.displayName || "");

      // Load existing profile (if any)
      const snap = await getDoc(doc(db, "users", u.uid));
      const data: any = snap.exists() ? snap.data() : {};

      // If admin, just go to admin
      const roleDb = String(data?.role || "").toUpperCase();
      if (roleDb === "ADMIN") {
        nav("/admin", { replace: true });
        return;
      }

      if (String(data?.displayName || "")) setName(String(data.displayName));
      if (String(data?.tenantSlug || "")) setDesiredSlug(String(data.tenantSlug));
    });

    return () => unsub();
  }, [nav]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    setSaving(true);
    try {
      const u = auth.currentUser;

      // ---------------- STUDENT ----------------
      if (effectiveRole === "student") {
        const tSlug = effectiveTenantSlug;
        if (!tSlug) {
          toast.error("Missing tenant slug. Open the coaching URL and try again.");
          return;
        }

        // Resolve tenant educatorId
        const tenantSnap = isTenantDomain ? null : await getDoc(doc(db, "tenants", tSlug));

        const educatorIdResolved = isTenantDomain
          ? tenant?.educatorId || ""
          : String(tenantSnap?.data()?.educatorId || "");

        if (!educatorIdResolved) {
          toast.error("Invalid coaching slug. Please check the coaching URL.");
          return;
        }

        const displayName = (name || u.displayName || "").trim();
        if (!displayName) {
          toast.error("Please enter your name.");
          return;
        }

        await updateProfile(u, { displayName }).catch(() => {});

        await setDoc(
          doc(db, "users", u.uid),
          {
            uid: u.uid,
            role: "STUDENT",
            displayName,
            email: u.email || email,
            photoURL: u.photoURL || photoURL || null,
            educatorId: educatorIdResolved,
            tenantSlug: tSlug, // legacy
            enrolledTenants: arrayUnion(tSlug),
            onboardingComplete: true,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );

        const token = await u.getIdToken();
        await callRegisterStudent(token, tSlug);

        toast.success("Profile completed!");
        if (isTenantDomain) {
          nav("/student", { replace: true });
        } else {
          window.location.href = studentRedirectUrl(tSlug);
        }
        return;
      }

      // ---------------- EDUCATOR ----------------
      const displayName = (name || u.displayName || "").trim();
      if (!displayName) {
        toast.error("Please enter your name.");
        return;
      }

      const slug = normSlug(desiredSlug);
      if (!slug) {
        toast.error("Please enter a valid tenant slug (subdomain).");
        return;
      }

      const ok = await checkSlugAvailable(slug, u.uid);
      if (!ok) {
        toast.error("This tenant slug is already taken. Try another.");
        return;
      }

      const coaching = (coachingName || displayName).trim();
      if (!coaching) {
        toast.error("Please enter coaching name.");
        return;
      }

      await updateProfile(u, { displayName }).catch(() => {});

      await setDoc(
        doc(db, "users", u.uid),
        {
          uid: u.uid,
          role: "EDUCATOR",
          displayName,
          email: u.email || email,
          photoURL: u.photoURL || photoURL || null,
          tenantSlug: slug,
          onboardingComplete: true,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      await setDoc(
        doc(db, "educators", u.uid),
        {
          tenantSlug: slug,
          coachingName: coaching,
          phone: phone || "",
          email: u.email || email,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      await setDoc(
        doc(db, "tenants", slug),
        {
          educatorId: u.uid,
          tenantSlug: slug,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      toast.success("Educator profile completed!");
      nav("/educator", { replace: true });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  if (!authReady || tenantLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-background lg:grid lg:grid-cols-2">
      <div className="relative flex min-h-screen flex-col p-6 lg:p-12">
        <div className="mb-8 flex items-center justify-between">
          <div className="text-2xl font-bold tracking-tighter">PREPAREKARO.IN</div>
          <Link
            to="/"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Home className="h-4 w-4" />
            Return to Home
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md space-y-6">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
              <p className="text-muted-foreground">
                Just a few details to finish setting up your account.
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  className="h-11"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>

              {effectiveRole === "educator" && (
                <>
                  <div className="space-y-2">
                    <Label>Coaching Name</Label>
                    <Input
                      className="h-11"
                      value={coachingName}
                      onChange={(e) => setCoachingName(e.target.value)}
                      placeholder="My Coaching"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Phone (optional)</Label>
                    <Input
                      className="h-11"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="9876543210"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Tenant Slug (subdomain)</Label>
                    <Input
                      className="h-11"
                      value={desiredSlug}
                      onChange={(e) => setDesiredSlug(e.target.value)}
                      placeholder="e.g. abc-coaching"
                    />
                    <p className="text-xs text-muted-foreground">
                      Your website will be:{" "}
                      <span className="font-medium">
                        {desiredSlug
                          ? `${normSlug(desiredSlug)}.${appDomain()}`
                          : `your-slug.${appDomain()}`}
                      </span>
                    </p>
                  </div>
                </>
              )}

              {effectiveRole === "student" && (
                <div className="rounded-lg border p-3 text-sm text-muted-foreground">
                  You are joining:{" "}
                  <span className="font-medium text-foreground">
                    {effectiveTenantSlug || "your coaching"}
                  </span>
                </div>
              )}

              <Button
                disabled={saving}
                className="mt-2 h-11 w-full bg-[#4F46E5] text-base text-white transition-colors hover:bg-[#4338CA]"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & Continue"}
              </Button>
            </form>
          </div>
        </div>
      </div>

      <div className="relative hidden flex-col items-center justify-center overflow-hidden bg-[#FFF5EE] p-12 lg:flex">
        <div className="absolute left-0 top-0 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-200/50 blur-[100px]" />
        <div className="absolute bottom-0 right-0 h-[500px] w-[500px] translate-x-1/3 translate-y-1/3 rounded-full bg-pink-200/40 blur-[100px]" />
        <div className="relative aspect-[4/5] w-full max-w-xl overflow-hidden rounded-[2rem] border-8 border-white/50 shadow-2xl">
          <img
            src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1000&auto=format&fit=crop"
            alt="Workspace"
            className="h-full w-full object-cover"
          />
        </div>
      </div>
    </div>
  );
}
