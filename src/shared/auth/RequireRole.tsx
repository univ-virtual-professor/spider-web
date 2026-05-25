import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@app/providers/AuthProvider";
import { useAppTokenBootstrap } from "@shared/hooks/useAppTokenBootstrap";
import type { UserRole } from "@app/providers/AuthProvider";
import { Loader2 } from "lucide-react";

type Props = {
  allow: UserRole[];
  redirectTo?: string;
  children: React.ReactNode;
};

export default function RequireRole({ allow, redirectTo = "/login", children }: Props) {
  const { firebaseUser, profile, loading } = useAuth();
  const location = useLocation();

  const isApp = new URLSearchParams(window.location.search).get("_app") === "1";
  const { isReady: appTokenReady } = useAppTokenBootstrap();

  // Wait for Firebase auth AND app-token exchange before making any decision.
  if (loading || (isApp && !appTokenReady)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (!firebaseUser) {
    return <Navigate to={redirectTo} replace state={{ from: location.pathname }} />;
  }

  const role = String(profile?.role || "STUDENT").toUpperCase() as UserRole;
  const allowed = allow.map((r) => String(r).toUpperCase());
  if (!allowed.includes(role)) {
    return <Navigate to={redirectTo} replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
