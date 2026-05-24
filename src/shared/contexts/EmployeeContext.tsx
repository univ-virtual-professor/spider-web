import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import type { Permission } from "@shared/lib/rolesConfig";

type EmployeeContextValue = {
  isEmployee: boolean;
  empLoading: boolean;
  permissions: Set<Permission>;
  branchIds: string[];
  hasPermission: (p: Permission) => boolean;
  inBranchScope: (branchId: string) => boolean;
};

const EmployeeContext = createContext<EmployeeContextValue>({
  isEmployee: false,
  empLoading: false,
  permissions: new Set(),
  branchIds: [],
  hasPermission: () => true,
  inBranchScope: () => true,
});

export function EmployeeProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [empLoading, setEmpLoading] = useState(false);
  const [permissions, setPermissions] = useState<Set<Permission>>(new Set());
  const [branchIds, setBranchIds] = useState<string[]>([]);

  const isEmployee = !!profile?.isEmployee;
  const orgUid = profile?.orgUid;
  const employeeDocId = profile?.employeeDocId;

  useEffect(() => {
    if (!isEmployee || !orgUid || !employeeDocId) {
      setPermissions(new Set());
      setBranchIds([]);
      return;
    }

    setEmpLoading(true);
    (async () => {
      try {
        const empSnap = await getDoc(doc(db, "educators", orgUid, "employees", employeeDocId));
        if (!empSnap.exists()) return;
        const empData = empSnap.data() as any;

        if (empData.status !== "ACTIVE") {
          // Deactivated employees get no permissions — sidebar will be empty
          return;
        }

        const roleSnap = await getDoc(doc(db, "roles", empData.roleId));
        if (roleSnap.exists()) {
          setPermissions(new Set((roleSnap.data() as any).permissions || []));
        }

        setBranchIds(empData.scope?.branchIds || []);
      } catch (e) {
        console.error("[EmployeeContext] failed to load permissions", e);
      } finally {
        setEmpLoading(false);
      }
    })();
  }, [isEmployee, orgUid, employeeDocId]);

  const hasPermission = (p: Permission) => {
    if (!isEmployee) return true;
    return permissions.has(p);
  };

  const inBranchScope = (branchId: string) => {
    if (!isEmployee) return true;
    if (branchIds.length === 0) return true;
    return branchIds.includes(branchId);
  };

  return (
    <EmployeeContext.Provider
      value={{ isEmployee, empLoading, permissions, branchIds, hasPermission, inBranchScope }}
    >
      {children}
    </EmployeeContext.Provider>
  );
}

export function useEmployee() {
  return useContext(EmployeeContext);
}
