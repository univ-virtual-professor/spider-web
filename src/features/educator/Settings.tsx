import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import InstituteBuilder from "./InstituteBuilder";
import {
  User,
  Mail,
  Phone,
  Lock,
  Bell,
  LogOut,
  Eye,
  EyeOff,
  Upload,
  Loader2,
  Globe,
  ExternalLink,
  ArrowLeft,
} from "lucide-react";
import { Input } from "@shared/ui/input";
import { Button } from "@shared/ui/button";
import { Label } from "@shared/ui/label";
import { Switch } from "@shared/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Separator } from "@shared/ui/separator";
import { toast } from "@shared/hooks/use-toast";
import { stringToColor } from "@shared/lib/utils";

import {
  signOut,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@shared/lib/firebase";
import { uploadToImageKit } from "@shared/lib/imagekitUpload";
import { useAuth } from "@app/providers/AuthProvider";
import { buildTenantUrl } from "@shared/lib/tenant";
import { logError } from "@shared/lib/errorLogger";

type EducatorPrefs = {
  notifications?: {
    email?: boolean;
    sms?: boolean;
    push?: boolean;
  };
};

type EducatorProfileDoc = {
  fullName?: string;
  displayName?: string;
  phone?: string;
  photoURL?: string;
  prefs?: EducatorPrefs;
  tenantSlug?: string;
  coachingName?: string;
  websiteConfig?: any;
};

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { firebaseUser, profile, loading: authLoading, refreshProfile } = useAuth();
  const [showBuilder, setShowBuilder] = useState(false);

  useEffect(() => {
    if (searchParams.get("builder") === "true") {
      setShowBuilder(true);
    } else {
      setShowBuilder(false);
    }
  }, [searchParams]);

  // Profile fields. Initialize from profile.
  const [fullName, setFullName] = useState(profile?.fullName || "");
  const [displayName, setDisplayName] = useState(profile?.displayName || "");
  const [email, setEmail] = useState(profile?.email || firebaseUser?.email || "");
  const [phone, setPhone] = useState("");
  const [coachingName, setCoachingName] = useState("");
  const [photoURL, setPhotoURL] = useState<string>(profile?.photoURL || "");

  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Subdomain / slug
  const [tenantSlug, setTenantSlug] = useState(profile?.tenantSlug || "");
  const [newTenantSlug, setNewTenantSlug] = useState("");
  const [changingSlug, setChangingSlug] = useState(false);

  const previewSlug = String(newTenantSlug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");

  // Password fields
  const [showPassword, setShowPassword] = useState(false);
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // Notification switches
  const [notifications, setNotifications] = useState({
    email: true,
    sms: false,
    push: true,
  });
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Sync local state with AuthProvider's profile
  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName || "");
      setDisplayName(profile.displayName || "");
      setEmail(profile.email || firebaseUser?.email || "");
      setPhotoURL(profile.photoURL || "");
      setTenantSlug(profile.tenantSlug || "");
    }
  }, [profile, firebaseUser]);

  // Load phone and notifications separately as they aren't in AuthProvider profile yet
  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) return;

    const loadExtraData = async () => {
      try {
        const profileRef = doc(db, "educators", uid);
        const snap = await getDoc(profileRef);
        const data = snap.exists() ? (snap.data() as EducatorProfileDoc) : {};

        setPhone(data.phone || "");
        setCoachingName(data?.coachingName || data?.websiteConfig?.coachingName || "");
        if (data.prefs?.notifications) {
          setNotifications({
            email: data.prefs.notifications.email ?? true,
            sms: data.prefs.notifications.sms ?? false,
            push: data.prefs.notifications.push ?? true,
          });
        }
      } catch (e) {
        logError(e, "Settings/loadExtraData");
      }
    };

    loadExtraData();
  }, [firebaseUser?.uid]);

  const initials = (displayName || fullName || "U")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase())
    .join("");

  async function handlePickPhoto() {
    fileRef.current?.click();
  }

  async function handleUploadPhoto(file: File) {
    if (!firebaseUser?.uid) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Max 2MB. Please upload a smaller image.",
        variant: "destructive",
      });
      return;
    }

    setUploadingPhoto(true);
    try {
      const { url } = await uploadToImageKit(
        file,
        `avatar_${firebaseUser.uid}_${Date.now()}`,
        "/educator-profiles",
        "website"
      );

      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { photoURL: url });
      }
      await setDoc(
        doc(db, "educators", firebaseUser.uid),
        { photoURL: url, updatedAt: serverTimestamp() },
        { merge: true }
      );

      await refreshProfile();

      toast({
        title: "Photo updated",
        description: "Your profile photo has been changed.",
      });
    } catch (err) {
      logError(err, "Settings/handleUploadPhoto");
      toast({
        title: "Upload failed",
        description: "Could not upload photo. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function saveProfile() {
    if (!firebaseUser?.uid || !auth.currentUser) return;

    if (!fullName.trim() || !displayName.trim()) {
      toast({
        title: "Missing details",
        description: "Full name and display name are required.",
        variant: "destructive",
      });
      return;
    }

    setSavingProfile(true);
    try {
      await updateProfile(auth.currentUser, {
        displayName: displayName.trim(),
        photoURL: photoURL || auth.currentUser.photoURL || undefined,
      });

      await setDoc(
        doc(db, "educators", firebaseUser.uid),
        {
          fullName: fullName.trim(),
          displayName: displayName.trim(),
          phone: phone.trim(),
          photoURL: photoURL || auth.currentUser.photoURL || "",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await updateDoc(doc(db, "educators", firebaseUser.uid), {
        coachingName: coachingName.trim(),
      });

      await refreshProfile();

      toast({
        title: "Saved",
        description: "Profile information updated successfully.",
      });
    } catch (err) {
      logError(err, "Settings/saveProfile");
      toast({
        title: "Save failed",
        description: "Could not save changes. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingProfile(false);
    }
  }

  async function updateSubdomainSlug() {
    if (!auth.currentUser || !firebaseUser?.uid) return;

    const slug = previewSlug;

    if (!slug || slug.length < 3) {
      toast({
        title: "Invalid slug",
        description: "Slug must be at least 3 characters.",
        variant: "destructive",
      });
      return;
    }

    setChangingSlug(true);
    try {
      const token = await firebaseUser?.getIdToken();
      const resp = await fetch("/api/tenant/change-slug", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newSlug: slug }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.error || "Failed to update subdomain.");
      }

      setTenantSlug(slug);
      setNewTenantSlug("");

      toast({
        title: "Subdomain updated",
        description: `Your new coaching URL is ${buildTenantUrl(slug, "/")}`,
      });

      // keep AuthProvider profile in sync
      await refreshProfile().catch(() => {});
    } catch (e: any) {
      logError(e, "Settings/updateSubdomainSlug");
      toast({
        title: "Update failed",
        description: e?.message || "Could not update subdomain.",
        variant: "destructive",
      });
    } finally {
      setChangingSlug(false);
    }
  }

  async function saveNotificationPrefs() {
    if (!firebaseUser?.uid) return;

    setSavingPrefs(true);
    try {
      await setDoc(
        doc(db, "educators", firebaseUser.uid),
        {
          prefs: {
            notifications: {
              email: notifications.email,
              sms: notifications.sms,
              push: notifications.push,
            },
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      toast({
        title: "Preferences saved",
        description: "Notification settings updated.",
      });
    } catch (err) {
      logError(err, "Settings/saveNotificationPrefs");
      toast({
        title: "Failed",
        description: "Could not save notification preferences.",
        variant: "destructive",
      });
    } finally {
      setSavingPrefs(false);
    }
  }

  async function handleUpdatePassword() {
    console.log("changing password", auth);
    const user = auth.currentUser;
    if (!user) return;

    if (!user.email) {
      toast({
        title: "Password not available",
        description: "This account doesn't have an email attached.",
        variant: "destructive",
      });
      return;
    }

    if (!currentPass || !newPass || !confirmPass) {
      toast({
        title: "Missing fields",
        description: "Please fill all password fields.",
        variant: "destructive",
      });
      return;
    }

    if (newPass !== confirmPass) {
      toast({
        title: "Passwords do not match",
        description: "New password and confirm password must match.",
        variant: "destructive",
      });
      return;
    }

    if (newPass.length < 6) {
      toast({
        title: "Weak password",
        description: "Password should be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    setUpdatingPassword(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPass);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPass);

      setCurrentPass("");
      setNewPass("");
      setConfirmPass("");

      console.log("password updated successfully");

      toast({
        title: "Password updated",
        description: "Your password has been changed successfully.",
      });
    } catch (e: any) {
      logError(e, "Settings/handleUpdatePassword");
      const msg =
        typeof e?.message === "string" && e.message.includes("auth/wrong-password")
          ? "Current password is incorrect."
          : "Could not update password. Please try again.";
      toast({
        title: "Update failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setUpdatingPassword(false);
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth);
      window.location.href = "/login?role=educator";
    } catch (err) {
      logError(err, "Settings/handleLogout");
      toast({
        title: "Logout failed",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading settings...
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground">
        Please login as educator to access Settings.
      </div>
    );
  }

  if (showBuilder) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSearchParams({})}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </button>
        <InstituteBuilder />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your account and preferences</p>
        </div>
      </div>

      <div className="max-w-3xl space-y-6">
        {/* Profile Section */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-5 w-5" />
                Profile Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  {profile?.photoURL && <AvatarImage src={profile.photoURL} />}
                  <AvatarFallback style={{ backgroundColor: stringToColor(initials) }}>
                    {initials}
                  </AvatarFallback>
                </Avatar>

                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePickPhoto}
                    disabled={uploadingPhoto}
                  >
                    {uploadingPhoto ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Change Photo
                      </>
                    )}
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">JPG, PNG or GIF. Max 2MB.</p>

                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadPhoto(f);
                      if (e.target) e.target.value = "";
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Display Name</Label>
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </Label>
                  <Input value={email} disabled />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Phone
                  </Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 ..."
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label>Coaching / Institute Name</Label>
                  <Input
                    value={coachingName}
                    onChange={(e) => setCoachingName(e.target.value)}
                    placeholder="e.g. Rishi Academy"
                  />
                  <p className="text-xs text-muted-foreground">
                    Shown as watermark on student test screens.
                  </p>
                </div>
              </div>

              <Button variant="outline" onClick={saveProfile} disabled={savingProfile}>
                {savingProfile ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Subdomain Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-5 w-5" />
                Subdomain (Your Coaching URL)
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Current URL:{" "}
                <span className="font-medium text-foreground">
                  {tenantSlug ? buildTenantUrl(tenantSlug, "/") : "Not set"}
                </span>
              </div>

              <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>New subdomain slug</Label>
                  <Input
                    value={newTenantSlug}
                    onChange={(e) => setNewTenantSlug(e.target.value)}
                    placeholder="e.g. rishi-academy"
                  />
                  <p className="text-xs text-muted-foreground">
                    Allowed: lowercase letters, numbers, hyphen. Length 3–40.
                  </p>

                  {previewSlug && previewSlug !== tenantSlug && (
                    <p className="text-xs text-muted-foreground">
                      Preview:{" "}
                      <span className="font-medium text-foreground">
                        {buildTenantUrl(previewSlug, "/")}
                      </span>
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={changingSlug || !tenantSlug}
                    onClick={() => setNewTenantSlug(tenantSlug)}
                  >
                    Reset
                  </Button>

                  <Button
                    type="button"
                    disabled={changingSlug || !previewSlug || previewSlug === tenantSlug}
                    onClick={updateSubdomainSlug}
                  >
                    {changingSlug ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      "Update Subdomain"
                    )}
                  </Button>
                </div>
              </div>

              {tenantSlug && (
                <Button
                  type="button"
                  variant="ghost"
                  className="justify-start px-0"
                  onClick={() => window.open(buildTenantUrl(tenantSlug, "/"), "_blank")}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open coaching website
                </Button>
              )}

              <Separator />

              <p className="text-xs text-muted-foreground">
                Note: Your old slug remains reserved to prevent anyone else from taking it, and
                existing student links keep working.
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Change Password */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lock className="h-5 w-5" />
                Change Password
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Current Password</Label>
                <Input
                  type="password"
                  placeholder="Enter current password"
                  value={currentPass}
                  onChange={(e) => setCurrentPass(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>New Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter new password"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Confirm New Password</Label>
                <Input
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                />
              </div>

              <Button variant="outline" onClick={handleUpdatePassword} disabled={updatingPassword}>
                {updatingPassword ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Password"
                )}
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Notifications Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-5 w-5" />
                Notification Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Email Notifications</p>
                      <p className="text-xs text-muted-foreground">Receive updates via email</p>
                    </div>
                    <Switch
                      checked={notifications.email}
                      onCheckedChange={(v) => setNotifications((prev) => ({ ...prev, email: v }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Push Notifications</p>
                      <p className="text-xs text-muted-foreground">Get push notifications in-app</p>
                    </div>
                    <Switch
                      checked={notifications.push}
                      onCheckedChange={(v) => setNotifications((prev) => ({ ...prev, push: v }))}
                    />
                  </div>
                </div>

                <Button variant="outline" onClick={saveNotificationPrefs} disabled={savingPrefs}>
                  {savingPrefs ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Preferences"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Security Section
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg border border-border">
              <div>
                <p className="text-sm font-medium">Two-Factor Authentication</p>
                <p className="text-xs text-muted-foreground">
                  Add an extra layer of security to your account
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  toast({
                    title: "Coming soon",
                    description: "2FA will be enabled in a later phase.",
                  })
                }
              >
                Enable
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border border-border">
              <div>
                <p className="text-sm font-medium">Active Sessions</p>
                <p className="text-xs text-muted-foreground">Manage your active login sessions</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  toast({
                    title: "Info",
                    description: "Session management will be added later.",
                  })
                }
              >
                View All
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div> */}

        {/* Danger Zone */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-destructive">
                <LogOut className="h-5 w-5" />
                Danger Zone
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Log out from all devices</p>
                  <p className="text-xs text-muted-foreground">This will end all active sessions</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    toast({
                      title: "Note",
                      description:
                        "Firebase client can't revoke sessions for other devices yet. Signing you out from this device.",
                    });
                    handleLogout();
                  }}
                >
                  Logout All
                </Button>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-destructive">Delete Account</p>
                  <p className="text-xs text-muted-foreground">
                    Permanently delete your account and all data
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() =>
                    toast({
                      title: "Blocked for safety",
                      description: "Account deletion will be handled from Admin in this phase.",
                      variant: "destructive",
                    })
                  }
                >
                  Delete
                </Button>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Logout</p>
                  <p className="text-xs text-muted-foreground">End your current session</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  Logout
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
