import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";

import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { useEmployee } from "@shared/contexts/EmployeeContext";
import { PERMISSIONS } from "@shared/lib/rolesConfig";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Textarea } from "@shared/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@shared/ui/dialog";
import { DsPageHeader, DsStatusPill, DsKpiRow } from "@shared/ui/ds";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";

type Stage = "enquiry" | "trial" | "documents" | "enrolled";

const STAGES: { id: Stage; label: string }[] = [
  { id: "enquiry", label: "Enquiry" },
  { id: "trial", label: "Trial" },
  { id: "documents", label: "Documents" },
  { id: "enrolled", label: "Enrolled" },
];

const STAGE_TAG_TONE: Record<Stage, "accent" | "info" | "positive" | "slate"> = {
  enquiry: "slate",
  trial: "info",
  documents: "accent",
  enrolled: "positive",
};

// Tailwind's JIT scanner needs literal class strings — a template-literal
// class like `bg-ds-${tone}` never gets generated, so this dot-color map
// exists purely so the stage-column dot can still be dynamically toned.
const STAGE_DOT_CLASS: Record<Stage, string> = {
  enquiry: "bg-ds-slate",
  trial: "bg-ds-info",
  documents: "bg-ds-accent",
  enrolled: "bg-ds-positive",
};

type Lead = {
  id: string;
  studentName: string;
  phone: string;
  email?: string;
  courseId?: string;
  courseName?: string;
  stage: Stage;
  assignedTo?: string;
  assignedToName?: string;
  source?: string;
  notes?: string;
  stageUpdatedAt?: Timestamp;
};

type Course = { id: string; name: string };
type Employee = { uid: string; name: string };

export default function Enrolments() {
  const { profile } = useAuth();
  const educatorId: string = profile?.uid ?? "";
  const { isEmployee, hasPermission } = useEmployee();
  const canManage = !isEmployee || hasPermission(PERMISSIONS.ENROLMENTS_MANAGE);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [defaultStage, setDefaultStage] = useState<Stage>("enquiry");
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formCourseId, setFormCourseId] = useState("none");
  const [formSource, setFormSource] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formAssignedTo, setFormAssignedTo] = useState("none");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!educatorId) return;
    const unsub = onSnapshot(collection(db, "educators", educatorId, "enquiries"), (snap) => {
      setLeads(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      setLoading(false);
    });
    return () => unsub();
  }, [educatorId]);

  useEffect(() => {
    if (!educatorId) return;
    const unsub = onSnapshot(collection(db, "educators", educatorId, "branches"), (snap) => {
      const unsubs = snap.docs.map((branchDoc) =>
        onSnapshot(
          collection(db, "educators", educatorId, "branches", branchDoc.id, "courses"),
          (courseSnap) => {
            const rows = courseSnap.docs.map((c) => ({ id: c.id, name: c.data().name as string }));
            setCourses((prev) => {
              const ids = new Set(rows.map((r) => r.id));
              return [...prev.filter((c) => !ids.has(c.id)), ...rows];
            });
          }
        )
      );
      return () => unsubs.forEach((u) => u());
    });
    return () => unsub();
  }, [educatorId]);

  useEffect(() => {
    if (!educatorId) return;
    const unsub = onSnapshot(collection(db, "educators", educatorId, "employees"), (snap) => {
      setEmployees(
        snap.docs
          .filter((d) => d.data().status === "ACTIVE")
          .map((d) => ({
            uid: d.data().uid,
            name: String(d.data().name || d.data().email || "Employee"),
          }))
      );
    });
    return () => unsub();
  }, [educatorId]);

  const leadsByStage = useMemo(() => {
    const groups: Record<Stage, Lead[]> = { enquiry: [], trial: [], documents: [], enrolled: [] };
    for (const lead of leads) {
      (groups[lead.stage] || groups.enquiry).push(lead);
    }
    return groups;
  }, [leads]);

  const kpis = useMemo(() => {
    const total = leads.length || 1;
    const enrolledToday = leadsByStage.enrolled.length;
    return [
      {
        label: "Open enquiries",
        value: String(leadsByStage.enquiry.length),
        sub: `of ${leads.length} total`,
        tone: "accent" as const,
        pct: (leadsByStage.enquiry.length / total) * 100,
      },
      {
        label: "Trials booked",
        value: String(leadsByStage.trial.length),
        tone: "info" as const,
        pct: (leadsByStage.trial.length / total) * 100,
      },
      {
        label: "In documents",
        value: String(leadsByStage.documents.length),
        tone: "slate" as const,
        pct: (leadsByStage.documents.length / total) * 100,
      },
      {
        label: "Enrolled",
        value: String(enrolledToday),
        sub: `${Math.round((enrolledToday / total) * 100)}% conversion`,
        tone: "positive" as const,
        pct: (enrolledToday / total) * 100,
      },
    ];
  }, [leads.length, leadsByStage]);

  function resetForm() {
    setFormName("");
    setFormPhone("");
    setFormEmail("");
    setFormCourseId("none");
    setFormSource("");
    setFormNotes("");
    setFormAssignedTo("none");
  }

  function openNew(stage: Stage) {
    setEditingLead(null);
    setDefaultStage(stage);
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(lead: Lead) {
    setEditingLead(lead);
    setDefaultStage(lead.stage);
    setFormName(lead.studentName);
    setFormPhone(lead.phone);
    setFormEmail(lead.email || "");
    setFormCourseId(lead.courseId || "none");
    setFormSource(lead.source || "");
    setFormNotes(lead.notes || "");
    setFormAssignedTo(lead.assignedTo || "none");
    setDialogOpen(true);
  }

  async function saveLead() {
    if (!formName.trim() || !formPhone.trim()) {
      toast.error("Name and phone are required");
      return;
    }
    setSaving(true);
    try {
      const course = courses.find((c) => c.id === formCourseId);
      const assignee = employees.find((e) => e.uid === formAssignedTo);
      const data = {
        studentName: formName.trim(),
        phone: formPhone.trim(),
        email: formEmail.trim() || null,
        courseId: course?.id || null,
        courseName: course?.name || null,
        source: formSource.trim() || null,
        notes: formNotes.trim() || null,
        assignedTo: assignee?.uid || null,
        assignedToName: assignee?.name || null,
        updatedAt: Timestamp.now(),
      };
      if (editingLead) {
        await updateDoc(doc(db, "educators", educatorId, "enquiries", editingLead.id), data);
      } else {
        await addDoc(collection(db, "educators", educatorId, "enquiries"), {
          ...data,
          stage: defaultStage,
          stageUpdatedAt: Timestamp.now(),
          createdAt: Timestamp.now(),
        });
      }
      toast.success("Saved");
      setDialogOpen(false);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function moveStage(lead: Lead, stage: Stage) {
    try {
      await updateDoc(doc(db, "educators", educatorId, "enquiries", lead.id), {
        stage,
        stageUpdatedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    } catch {
      toast.error("Failed to move");
    }
  }

  async function deleteLead(lead: Lead) {
    if (!window.confirm(`Delete lead "${lead.studentName}"?`)) return;
    try {
      await deleteDoc(doc(db, "educators", educatorId, "enquiries", lead.id));
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-ds-slate" />
      </div>
    );
  }

  return (
    <div className="space-y-5 font-ds-sans">
      <DsPageHeader
        title="Enrolments"
        subtitle={`${leadsByStage.enquiry.length} open enquiries · ${leadsByStage.trial.length} trials booked`}
        primary={
          canManage
            ? {
                label: "New enquiry",
                icon: <Plus className="mr-1 h-3.5 w-3.5" />,
                onClick: () => openNew("enquiry"),
              }
            : undefined
        }
      />

      <DsKpiRow items={kpis} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((stageDef) => (
          <div
            key={stageDef.id}
            className="rounded-[10px] border border-ds-ink/[.09] bg-ds-surface p-[13px_13px_9px]"
          >
            <div className="mb-2.5 flex items-center gap-2">
              <div className={`h-1.5 w-1.5 rounded-sm ${STAGE_DOT_CLASS[stageDef.id]}`} />
              <div className="font-ds-sans text-[12.5px] font-semibold text-ds-ink">
                {stageDef.label}
              </div>
              <div className="flex-1" />
              <div className="font-ds-mono text-[11px] text-ds-ink/45">
                {leadsByStage[stageDef.id].length}
              </div>
            </div>

            {leadsByStage[stageDef.id].map((lead) => (
              <div
                key={lead.id}
                className="group mb-2 rounded-[8px] border border-ds-ink/[.09] p-[10px_11px] hover:border-ds-ink/20"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-ds-sans text-[12.5px] font-semibold text-ds-ink">
                    {lead.studentName}
                  </div>
                  {canManage && (
                    <div className="hidden shrink-0 gap-0.5 group-hover:flex">
                      <button
                        className="rounded p-0.5 text-ds-slate hover:bg-ds-fill"
                        onClick={() => openEdit(lead)}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        className="rounded p-0.5 text-ds-slate hover:bg-ds-fill hover:text-red-600"
                        onClick={() => deleteLead(lead)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-0.5 font-ds-sans text-[11px] text-ds-ink/50">
                  {[lead.courseName, lead.phone].filter(Boolean).join(" · ")}
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <DsStatusPill tone={STAGE_TAG_TONE[stageDef.id]}>
                    {lead.source || lead.assignedToName || "New"}
                  </DsStatusPill>
                  <div className="flex-1" />
                  <div className="font-ds-mono text-[10.5px] text-ds-ink/40">
                    {lead.stageUpdatedAt
                      ? formatDistanceToNowStrict(lead.stageUpdatedAt.toDate(), {
                          addSuffix: false,
                        })
                      : "—"}
                  </div>
                </div>
                {canManage && (
                  <Select value={lead.stage} onValueChange={(v) => moveStage(lead, v as Stage)}>
                    <SelectTrigger className="mt-2 h-6 border-ds-ink/10 px-2 font-ds-sans text-[10.5px] text-ds-slate">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGES.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">
                          Move to {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}

            {canManage && (
              <button
                onClick={() => openNew(stageDef.id)}
                className="mb-1 flex h-[30px] w-full items-center justify-center rounded-[7px] border border-dashed border-ds-ink/20 font-ds-sans text-[11.5px] font-medium text-ds-ink/45 hover:border-ds-ink/35 hover:text-ds-ink/65"
              >
                + Add
              </button>
            )}
          </div>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLead ? "Edit Lead" : "New Lead"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Email (optional)</Label>
                <Input value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Interested course</Label>
              <Select value={formCourseId} onValueChange={setFormCourseId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assigned to</Label>
              <Select value={formAssignedTo} onValueChange={setFormAssignedTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.uid} value={e.uid}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Source (optional)</Label>
              <Input
                value={formSource}
                onChange={(e) => setFormSource(e.target.value)}
                placeholder="Walk-in, referral, ad campaign..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveLead} disabled={saving}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
