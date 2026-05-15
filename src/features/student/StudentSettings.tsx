import { useEffect, useMemo, useState } from "react";
import { User, Mail, Shield, Bell, Moon, Sun, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Switch } from "@shared/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { useAuth } from "@app/providers/AuthProvider";
import { useTenant } from "@app/providers/TenantProvider";
import { db } from "@shared/lib/firebase";

import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { getAuth, sendPasswordResetEmail, updateProfile } from "firebase/auth";

type UserDoc = {
  role?: string;
  displayName?: string;
  name?: string;
  phone?: string;
  photoURL?: string;
  avatar?: string;

  educatorId?: string;
  tenantSlug?: string;

  batch?: string;
  batchName?: string;

  preferences?: {
    pushNotifications?: boolean;
  };
};

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "S";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export default function StudentSettings() {
  const { theme, setTheme } = useTheme();
  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const { tenant, tenantSlug, loading: tenantLoading } = useTenant();

  const [loading, setLoading] = useState(true);

  const [photoURL, setPhotoURL] = useState<string>("");
  const [fullName, setFullName] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [email, setEmail] = useState<string>("");

  const [pushNotifications, setPushNotifications] = useState<boolean>(true);

  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const uid = firebaseUser?.uid || null;

  const coachingName = useMemo(() => {
    return tenant?.coachingName || tenant?.educatorId || "Your Coaching";
  }, [tenant, profile]);

  const batchLabel = useMemo(() => {
    return (
      profile?.role || profile?.tenantSlug || tenant?.coachingName || tenant?.educatorId || "Batch"
    );
  }, [profile, tenant]);

  // Live load from users/{uid}
  useEffect(() => {
    if (authLoading || tenantLoading) {
      setLoading(true);
      return;
    }
    if (!uid) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const ref = doc(db, "users", uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = (snap.exists() ? (snap.data() as UserDoc) : {}) as UserDoc;

        const authName = firebaseUser?.displayName || "";
        const authPhoto = firebaseUser?.photoURL || "";
        const authEmail = firebaseUser?.email || "";

        const nameFromDoc = (data.displayName || data.name || "").trim();
        const phoneFromDoc = (data.phone || "").trim();
        const photoFromDoc = (data.photoURL || data.avatar || "").trim();

        setFullName(nameFromDoc || authName || "");
        setPhone(phoneFromDoc);
        setEmail(authEmail);

        setPhotoURL(photoFromDoc || authPhoto || "");

        const pn = data.preferences?.pushNotifications;
        setPushNotifications(typeof pn === "boolean" ? pn : true);

        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [uid, authLoading, tenantLoading, firebaseUser]);

  const canSave = useMemo(() => {
    return !!uid && fullName.trim().length >= 2 && !saving;
  }, [uid, fullName, saving]);

  const saveChanges = async () => {
    if (!uid) return;

    const name = fullName.trim();
    if (name.length < 2) {
      toast.error("Please enter a valid full name.");
      return;
    }

    setSaving(true);
    try {
      // Ensure doc exists and merge safe fields
      await setDoc(
        doc(db, "users", uid),
        {
          role: "student",
          displayName: name,
          phone: phone.trim(),
          email: firebaseUser?.email || email || null,
          photoURL: photoURL || firebaseUser?.photoURL || null,

          // keep tenant linkage if available
          educatorId: tenant?.educatorId || profile?.educatorId || null,
          tenantSlug: tenantSlug || profile?.tenantSlug || null,

          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(), // harmless due to merge true; won’t overwrite if already present (Firestore keeps latest write, but ok)
        },
        { merge: true }
      );

      // Update Firebase Auth profile (best-effort)
      try {
        if (firebaseUser) {
          const auth = getAuth();
          await updateProfile(auth.currentUser!, {
            displayName: name,
            photoURL: photoURL || firebaseUser.photoURL || undefined,
          });
        }
      } catch (e) {
        // not critical; Firestore is source of truth for your app UI
        console.warn("Auth profile update failed:", e);
      }

      toast.success("Profile updated successfully!");
    } catch (e) {
      console.error(e);
      toast.error("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  const togglePushNotifications = async (checked: boolean) => {
    if (!uid) return;

    setPushNotifications(checked);
    try {
      await setDoc(
        doc(db, "users", uid),
        {
          preferences: { pushNotifications: checked },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.error(e);
      toast.error("Failed to update preference.");
    }
  };

  const changePassword = async () => {
    if (!firebaseUser?.email) {
      toast.error("No email found for your account.");
      return;
    }
    setSendingReset(true);
    try {
      const auth = getAuth();
      await sendPasswordResetEmail(auth, firebaseUser.email);
      toast.success("Password reset email sent. Check your inbox.");
    } catch (e) {
      console.error(e);
      toast.error("Failed to send reset email.");
    } finally {
      setSendingReset(false);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">Loading...</div>;
  }

  if (!uid) {
    return (
      <div className="py-12 text-center text-muted-foreground">Please login to view settings.</div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      {/* Profile Card */}
      <Card className="card-soft border-0 bg-pastel-mint">
        <CardContent className="flex items-center gap-4 p-6">
          <Avatar className="h-20 w-20 border-4 border-white shadow-lg">
            <AvatarImage src={photoURL} />
            <AvatarFallback>{initials(fullName || "Student")}</AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-xl font-bold">{fullName || "Student"}</h2>
            <p className="text-muted-foreground">{batchLabel}</p>
            <p className="text-sm text-muted-foreground">{coachingName}</p>
          </div>
        </CardContent>
      </Card>

      {/* Personal Info */}
      <Card className="card-soft border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Personal Information
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Full Name</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 rounded-xl"
                placeholder="Enter your name"
              />
            </div>

            <div>
              <Label>Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 rounded-xl"
                placeholder="Enter your phone"
              />
            </div>
          </div>

          <div>
            <Label className="flex items-center gap-2">
              <Mail className="h-4 w-4" /> Email
            </Label>
            <Input value={email} disabled className="mt-1 rounded-xl opacity-80" />
          </div>

          <Button className="gradient-bg rounded-xl" onClick={saveChanges} disabled={!canSave}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save Changes
          </Button>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card className="card-soft border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Preferences
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
            <div className="flex items-center gap-3">
              {theme === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              <div>
                <p className="font-medium">Dark Mode</p>
                <p className="text-xs text-muted-foreground">Toggle dark/light theme</p>
              </div>
            </div>
            <Switch
              checked={theme === "dark"}
              onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5" />
              <div>
                <p className="font-medium">Push Notifications</p>
                <p className="text-xs text-muted-foreground">
                  Get notified about new tests and results
                </p>
              </div>
            </div>
            <Switch
              checked={pushNotifications}
              onCheckedChange={(checked) => togglePushNotifications(!!checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="card-soft border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={changePassword}
            disabled={sendingReset}
          >
            {sendingReset ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Change Password
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            We’ll send a password reset link to your email.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
