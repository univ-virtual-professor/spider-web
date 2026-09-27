import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useEmployee } from "@shared/contexts/EmployeeContext";
import type { Permission } from "@shared/lib/rolesConfig";

type Props = {
  /** Employee needs at least one of these permissions. Ignored when ownerOnly is set. */
  anyOf?: Permission[];
  /** Route is for the org head only — no employee permission grants access. */
  ownerOnly?: boolean;
  redirectTo?: string;
  children: React.ReactNode;
};

/**
 * Route-level counterpart to the permission checks EducatorLayout uses to decide
 * sidebar visibility. Without this, an employee could reach a gated page by typing
 * its URL directly, since sidebar filtering alone doesn't stop navigation.
 */
export default function RequirePermission({
  anyOf,
  ownerOnly,
  redirectTo = "/educator/dashboard",
  children,
}: Props) {
  const { isEmployee, empLoading, hasPermission } = useEmployee();
  const location = useLocation();

  if (isEmployee && empLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (isEmployee) {
    if (ownerOnly) {
      return <Navigate to={redirectTo} replace state={{ from: location.pathname }} />;
    }
    if (anyOf && anyOf.length > 0 && !anyOf.some((p) => hasPermission(p))) {
      return <Navigate to={redirectTo} replace state={{ from: location.pathname }} />;
    }
  }

  return <>{children}</>;
}
