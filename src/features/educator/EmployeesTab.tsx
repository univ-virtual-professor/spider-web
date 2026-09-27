import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth, db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { toast } from "sonner";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Checkbox } from "@shared/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@shared/ui/dropdown-menu";
import { Loader2, Plus, MoreVertical, UserX, UserCheck, Trash2, Send } from "lucide-react";
import type { Permission } from "@shared/lib/employeePermissions";
import { DsCard, DsTableHead, DsTableRow, DsStatusPill } from "@shared/ui/ds";

type PillTone = "accent" | "info" | "positive" | "slate" | "neutral";

type Branch = { id: string; name: string; location: string };

type Role = {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  status: "active" | "archived";
};

type EmployeeStatus = "PENDING" | "ACTIVE" | "DEACTIVATED" | "EXPIRED";

type Employee = {
  id: string;
  uid: string;
  email: string;
  name: string;
  roleId: string;
  status: EmployeeStatus;
  scope: { branchIds: string[] };
  invitedAt: any;
  activatedAt: any;
};

const STATUS_TONE: Record<EmployeeStatus, PillTone> = {
  ACTIVE: "positive",
  PENDING: "info",
  DEACTIVATED: "accent",
  EXPIRED: "slate",
};

type Props = { educatorId: string; branches: Branch[] };

export default function EmployeesTab({ educatorId, branches }: Props) {
  const { firebaseUser } = useAuth();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [empLoading, setEmpLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empBusy, setEmpBusy] = useState(false);

  // Form state
  const [empEmail, setEmpEmail] = useState("");
  const [empName, setEmpName] = useState("");
  const [empRoleId, setEmpRoleId] = useState("");
  const [empBranchIds, setEmpBranchIds] = useState<string[]>([]);

  // Filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (!educatorId) return;
    const unsub = onSnapshot(
      collection(db, "educators", educatorId, "employees"),
      (snap) => {
        setEmployees(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Employee, "id">) })));
        setEmpLoading(false);
      },
      () => setEmpLoading(false)
    );
    return () => unsub();
  }, [educatorId]);

  useEffect(() => {
    getDocs(query(collection(db, "roles"), where("status", "==", "active"))).then((snap) => {
      setRoles(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Role, "id">) })));
    });
  }, []);

  // Filtered list
  const filtered = employees.filter((emp) => {
    const matchSearch =
      !search ||
      emp.name.toLowerCase().includes(search.toLowerCase()) ||
      emp.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || emp.roleId === roleFilter;
    const matchStatus = statusFilter === "all" || emp.status === statusFilter;
    return matchSearch && matchRole && matchStatus;
  });

  function openInvite() {
    setEditingEmp(null);
    setEmpEmail("");
    setEmpName("");
    setEmpRoleId(roles[0]?.id || "");
    setEmpBranchIds([]);
    setDialogOpen(true);
  }

  function openEdit(emp: Employee) {
    setEditingEmp(emp);
    setEmpEmail(emp.email);
    setEmpName(emp.name);
    setEmpRoleId(emp.roleId);
    setEmpBranchIds(emp.scope?.branchIds || []);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!empRoleId) {
      toast.error("Role required");
      return;
    }

    if (!editingEmp) {
      // Invite new employee
      if (!empEmail.trim() || !empName.trim()) {
        toast.error("Email and name are required");
        return;
      }
      setEmpBusy(true);
      try {
        const token = await firebaseUser?.getIdToken();
        const base = import.meta.env.VITE_MONKEY_KING_API_URL || "";
        const res = await fetch(`${base}/api/org/invite-employee`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email: empEmail.trim(),
            name: empName.trim(),
            role_id: empRoleId,
            branch_ids: empBranchIds,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Invite failed");
        }
        // Send password reset (invite) email via Firebase client SDK
        await sendPasswordResetEmail(auth, empEmail.trim());
        toast.success("Invite sent! Employee will receive an email to set their password.");
        setDialogOpen(false);
      } catch (e: any) {
        toast.error(e.message || "Failed to invite employee");
      } finally {
        setEmpBusy(false);
      }
    } else {
      // Update existing employee
      setEmpBusy(true);
      try {
        await updateDoc(doc(db, "educators", educatorId, "employees", editingEmp.id), {
          roleId: empRoleId,
          scope: { branchIds: empBranchIds },
        });
        toast.success("Employee updated");
        setDialogOpen(false);
      } catch {
        toast.error("Update failed");
      } finally {
        setEmpBusy(false);
      }
    }
  }

  async function deactivate(emp: Employee) {
    if (!confirm(`Deactivate ${emp.name}? They will lose access on their next login.`)) return;
    await updateDoc(doc(db, "educators", educatorId, "employees", emp.id), {
      status: "DEACTIVATED",
    });
    toast.success("Employee deactivated");
  }

  async function reactivate(emp: Employee) {
    await updateDoc(doc(db, "educators", educatorId, "employees", emp.id), { status: "ACTIVE" });
    toast.success("Employee reactivated");
  }

  async function resendInvite(emp: Employee) {
    try {
      await sendPasswordResetEmail(auth, emp.email);
      await updateDoc(doc(db, "educators", educatorId, "employees", emp.id), {
        status: "PENDING",
        invitedAt: Timestamp.now(),
        inviteExpiresAt: Timestamp.fromDate(new Date(Date.now() + 72 * 60 * 60 * 1000)),
      });
      toast.success("Invite resent");
    } catch {
      toast.error("Failed to resend invite");
    }
  }

  async function removeEmployee(emp: Employee) {
    if (!confirm(`Permanently remove ${emp.name}? This cannot be undone.`)) return;
    await deleteDoc(doc(db, "educators", educatorId, "employees", emp.id));
    toast.success("Employee removed");
  }

  function toggleBranch(branchId: string) {
    setEmpBranchIds((prev) =>
      prev.includes(branchId) ? prev.filter((id) => id !== branchId) : [...prev, branchId]
    );
  }

  function scopeLabel(emp: Employee) {
    const ids = emp.scope?.branchIds || [];
    if (ids.length === 0) return "All Branches";
    return (
      branches
        .filter((b) => ids.includes(b.id))
        .map((b) => b.name)
        .join(", ") || "—"
    );
  }

  const selectedRole = roles.find((r) => r.id === empRoleId);

  return (
    <div className="space-y-4 font-ds-sans">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap gap-2">
          <Input
            placeholder="Search name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs border-ds-ink/15"
          />
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-40 border-ds-ink/15">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 border-ds-ink/15">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="DEACTIVATED">Deactivated</SelectItem>
              <SelectItem value="EXPIRED">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={openInvite}
          disabled={roles.length === 0}
          className="bg-ds-accent hover:bg-ds-accent/90"
        >
          <Plus className="mr-2 h-4 w-4" /> Invite Employee
        </Button>
      </div>

      {roles.length === 0 && (
        <p className="rounded-[10px] border border-ds-accent/25 bg-ds-accent/[.08] p-3 font-ds-sans text-[12px] text-ds-accent">
          No roles available. Ask the platform admin to create roles before inviting employees.
        </p>
      )}

      <DsCard className="overflow-hidden">
        {empLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-ds-slate" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center font-ds-sans text-[12.5px] text-ds-slate">
            {employees.length === 0
              ? "No employees yet. Invite your first team member."
              : "No employees match the current filters."}
          </p>
        ) : (
          <>
            <DsTableHead
              columns={["Name", "Role", "Scope", "Status", ""]}
              cols="1.5fr .9fr 1fr .8fr .4fr"
            />
            {filtered.map((emp) => (
              <DsTableRow key={emp.id} cols="1.5fr .9fr 1fr .8fr .4fr" height={54}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-ds-fill font-ds-sans text-[10px] font-semibold text-ds-ink/70">
                      {emp.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{emp.name}</div>
                      <div className="truncate font-ds-sans text-[11px] text-ds-ink/45">
                        {emp.email}
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  {roles.find((r) => r.id === emp.roleId)?.name ? (
                    <span className="inline-flex rounded-md bg-ds-fill px-2 py-0.5 font-ds-mono text-[10.5px] font-semibold text-ds-ink/70">
                      {roles.find((r) => r.id === emp.roleId)?.name}
                    </span>
                  ) : (
                    <span className="text-ds-ink/40">Unknown</span>
                  )}
                </div>
                <div className="truncate text-ds-ink/60">{scopeLabel(emp)}</div>
                <div>
                  <DsStatusPill tone={STATUS_TONE[emp.status]}>{emp.status}</DsStatusPill>
                </div>
                <div className="flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(emp)}>
                        Edit Role &amp; Scope
                      </DropdownMenuItem>
                      {(emp.status === "PENDING" || emp.status === "EXPIRED") && (
                        <DropdownMenuItem onClick={() => resendInvite(emp)}>
                          <Send className="mr-2 h-3.5 w-3.5" />
                          Resend Invite
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      {emp.status === "ACTIVE" || emp.status === "PENDING" ? (
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => deactivate(emp)}
                        >
                          <UserX className="mr-2 h-3.5 w-3.5" />
                          Deactivate
                        </DropdownMenuItem>
                      ) : emp.status === "DEACTIVATED" ? (
                        <>
                          <DropdownMenuItem onClick={() => reactivate(emp)}>
                            <UserCheck className="mr-2 h-3.5 w-3.5" />
                            Reactivate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => removeEmployee(emp)}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            Remove
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </DsTableRow>
            ))}
          </>
        )}
      </DsCard>

      {/* Invite / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && setDialogOpen(false)}>
        <DialogContent className="max-h-[90vh] max-w-[95vw] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingEmp ? `Edit — ${editingEmp.name}` : "Invite Employee"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editingEmp && (
              <>
                <div className="space-y-1">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={empEmail}
                    onChange={(e) => setEmpEmail(e.target.value)}
                    placeholder="employee@example.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Full Name *</Label>
                  <Input
                    value={empName}
                    onChange={(e) => setEmpName(e.target.value)}
                    placeholder="John Doe"
                  />
                </div>
              </>
            )}

            <div className="space-y-1">
              <Label>Role *</Label>
              <Select value={empRoleId} onValueChange={setEmpRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedRole && (
                <p className="text-xs text-muted-foreground">{selectedRole.description}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>
                Branch Access{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (leave empty for all branches)
                </span>
              </Label>
              {branches.length === 0 ? (
                <p className="text-sm text-muted-foreground">No branches created yet.</p>
              ) : (
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                  {branches.map((b) => (
                    <div key={b.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`branch-${b.id}`}
                        checked={empBranchIds.includes(b.id)}
                        onCheckedChange={() => toggleBranch(b.id)}
                      />
                      <label
                        htmlFor={`branch-${b.id}`}
                        className="cursor-pointer select-none text-sm"
                      >
                        {b.name}
                        {b.location && (
                          <span className="ml-1 text-xs text-muted-foreground">({b.location})</span>
                        )}
                      </label>
                    </div>
                  ))}
                </div>
              )}
              {empBranchIds.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No branches selected = access to all branches within their role's permissions.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={empBusy}>
                {empBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingEmp ? "Save Changes" : "Send Invite"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
