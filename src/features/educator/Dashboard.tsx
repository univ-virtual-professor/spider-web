import { Navigate } from "react-router-dom";

import { useAuth } from "@app/providers/AuthProvider";
import { useEmployee } from "@shared/contexts/EmployeeContext";
import { PRIMARY_NAV_ORDER, resolveEducatorPortalRole } from "./lib/educatorRole";
import OwnerOverview from "./OwnerOverview";
import FacultyToday from "./FacultyToday";

// /educator/dashboard — picks the role's home screen (BUILD-NOTES §04: ow_overview
// for Owner, fa_today for Faculty). Ops has no overview screen of its own in the
// design; it lands on its own first primary-nav item instead (Timetable).
export default function EducatorDashboard() {
  const { loading: authLoading } = useAuth();
  const { isEmployee, empLoading, roleName } = useEmployee();

  if (authLoading || (isEmployee && empLoading)) {
    return <div className="py-12 text-center text-muted-foreground">Loading...</div>;
  }

  const role = resolveEducatorPortalRole(isEmployee, roleName);

  if (role === "Ops") {
    return <Navigate to={PRIMARY_NAV_ORDER.Ops[0]} replace />;
  }

  if (role === "Faculty") {
    return <FacultyToday />;
  }

  return <OwnerOverview />;
}
