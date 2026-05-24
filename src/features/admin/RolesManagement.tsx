import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, Timestamp, setDoc } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { toast } from "sonner";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Badge } from "@shared/ui/badge";
import { Checkbox } from "@shared/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table";
import { Loader2, Plus, Pencil, Archive, RotateCcw, Copy, Sparkles } from "lucide-react";
import {
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  DEFAULT_ROLES,
  type Permission,
} from "@shared/lib/rolesConfig";

type Role = {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  status: "active" | "archived";
  createdAt: any;
};

export default function RolesManagement() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<Permission[]>([]);

  useEffect(() => {
    loadRoles();
  }, []);

  async function loadRoles() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "roles"));
      setRoles(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Role, "id">) })));
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setName("");
    setDescription("");
    setSelectedPermissions([]);
    setDialogOpen(true);
  }

  function openEdit(role: Role) {
    setEditing(role);
    setName(role.name);
    setDescription(role.description);
    setSelectedPermissions(role.permissions);
    setDialogOpen(true);
  }

  function openClone(role: Role) {
    setEditing(null);
    setName(`${role.name} (Copy)`);
    setDescription(role.description);
    setSelectedPermissions(role.permissions);
    setDialogOpen(true);
  }

  async function saveRole() {
    if (!name.trim() || !description.trim() || selectedPermissions.length === 0) {
      toast.error("Name, description, and at least one permission are required");
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await updateDoc(doc(db, "roles", editing.id), {
          name,
          description,
          permissions: selectedPermissions,
          updatedAt: Timestamp.now(),
        });
        toast.success("Role updated");
      } else {
        await addDoc(collection(db, "roles"), {
          name,
          description,
          permissions: selectedPermissions,
          status: "active",
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
        toast.success("Role created");
      }
      setDialogOpen(false);
      loadRoles();
    } catch {
      toast.error("Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function archiveRole(role: Role) {
    if (
      !confirm(
        `Archive "${role.name}"? Employees with this role keep their access until reassigned.`
      )
    )
      return;
    await updateDoc(doc(db, "roles", role.id), { status: "archived", updatedAt: Timestamp.now() });
    toast.success("Role archived");
    loadRoles();
  }

  async function restoreRole(role: Role) {
    await updateDoc(doc(db, "roles", role.id), { status: "active", updatedAt: Timestamp.now() });
    toast.success("Role restored");
    loadRoles();
  }

  async function seedDefaultRoles() {
    if (
      !confirm(
        "Add the 5 default role templates? Existing roles with the same ID won't be overwritten."
      )
    )
      return;
    setBusy(true);
    try {
      const existingSnap = await getDocs(collection(db, "roles"));
      const existingIds = new Set(existingSnap.docs.map((d) => d.id));
      let added = 0;
      for (const role of DEFAULT_ROLES) {
        if (!existingIds.has(role.id)) {
          await setDoc(doc(db, "roles", role.id), {
            name: role.name,
            description: role.description,
            permissions: role.permissions,
            status: "active",
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          });
          added++;
        }
      }
      toast.success(
        added > 0 ? `${added} default role(s) added` : "All default roles already exist"
      );
      loadRoles();
    } catch {
      toast.error("Seeding failed");
    } finally {
      setBusy(false);
    }
  }

  function togglePermission(p: Permission) {
    setSelectedPermissions((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Employee Roles</h1>
          <p className="text-sm text-muted-foreground">
            Define roles and their permissions. Educators assign these to their staff.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={seedDefaultRoles} disabled={busy}>
            <Sparkles className="mr-2 h-4 w-4" /> Seed Defaults
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Create Role
          </Button>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.id} className={role.status === "archived" ? "opacity-50" : ""}>
                <TableCell>
                  <p className="font-medium">{role.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{role.description}</p>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {role.permissions.slice(0, 3).map((p) => (
                      <Badge key={p} variant="secondary" className="text-xs">
                        {PERMISSION_LABELS[p]?.label || p}
                      </Badge>
                    ))}
                    {role.permissions.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{role.permissions.length - 3} more
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={role.status === "active" ? "default" : "secondary"}>
                    {role.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(role)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openClone(role)} title="Clone">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    {role.status === "active" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => archiveRole(role)}
                        title="Archive"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => restoreRole(role)}
                        title="Restore"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {roles.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">
                  No roles yet. Create the first role to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-[95vw] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Role" : "Create Role"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Role Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Branch Manager"
              />
            </div>
            <div className="space-y-1">
              <Label>Description *</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this role do? (shown to org admin)"
              />
            </div>
            <div className="space-y-4">
              <Label>Permissions *</Label>
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {group.permissions.map((p) => {
                      const info = PERMISSION_LABELS[p];
                      return (
                        <div key={p} className="flex items-start gap-2 rounded-md border p-2.5">
                          <Checkbox
                            id={`perm-${p}`}
                            checked={selectedPermissions.includes(p)}
                            onCheckedChange={() => togglePermission(p)}
                            className="mt-0.5"
                          />
                          <label htmlFor={`perm-${p}`} className="cursor-pointer select-none">
                            <p className="text-sm font-medium">{info.label}</p>
                            <p className="text-xs text-muted-foreground">{info.description}</p>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveRole} disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? "Save Changes" : "Create Role"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
