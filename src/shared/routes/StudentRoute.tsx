import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@app/providers/AuthProvider";
import { useTenant } from "@app/providers/TenantProvider";
import { Loader2 } from "lucide-react";

export default function StudentRoute() {
  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const { isTenantDomain, tenantSlug, loading: tenantLoading } = useTenant();
  const location = useLocation();

  const isImpersonating = !!sessionStorage.getItem("imp_session");

  // wait for both contexts
  if (authLoading || tenantLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  // Students must be on tenant domain — unless impersonating (admin opened /impersonate
  // which uses navigate() so no page reload; impAuth user stays in memory).
  if (!isTenantDomain && !isImpersonating) {
    return <Navigate to="/" replace />;
  }

  if (!firebaseUser) {
    return <Navigate to="/login?role=student" replace state={{ from: location.pathname }} />;
  }

  const role = String(profile?.role || "STUDENT").toUpperCase();
  if (role !== "STUDENT") {
    return <Navigate to="/login?role=student" replace state={{ from: location.pathname }} />;
  }

  // Skip enrollment check when impersonating — admin explicitly chose this student.
  if (!isImpersonating) {
    const enrolledTenants = Array.isArray(profile?.enrolledTenants)
      ? profile!.enrolledTenants!
      : typeof profile?.tenantSlug === "string"
        ? [profile.tenantSlug]
        : [];

    if (!tenantSlug || !enrolledTenants.includes(tenantSlug)) {
      return <Navigate to="/signup?role=student" replace state={{ from: location.pathname }} />;
    }
  }

  return <Outlet />;
}
