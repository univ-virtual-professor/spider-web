import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@app/providers/AuthProvider";
import { useTenant } from "@app/providers/TenantProvider";
import { useAppTokenBootstrap } from "@shared/hooks/useAppTokenBootstrap";
import { Loader2 } from "lucide-react";

export default function StudentRoute() {
  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const { isTenantDomain, tenantSlug, loading: tenantLoading } = useTenant();
  const location = useLocation();

  const isApp =
    new URLSearchParams(window.location.search).get("_app") === "1" ||
    window.sessionStorage.getItem("__PK_APP_WEBVIEW__") === "1";
  const {
    isReady: appTokenReady,
    status: appTokenStatus,
    error: appTokenError,
  } = useAppTokenBootstrap();

  const isImpersonating = !!sessionStorage.getItem("imp_session");

  // Wait for Firebase auth, tenant context, AND app-token exchange before making any decision.
  if (authLoading || tenantLoading || (isApp && !appTokenReady)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (isApp && appTokenStatus === "error") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6 text-center">
        <div>
          <p className="mb-1 font-semibold text-destructive">Authentication error</p>
          <p className="text-sm text-muted-foreground">
            {appTokenError ?? "Unable to authenticate from the app. Please go back and try again."}
          </p>
        </div>
      </div>
    );
  }

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
