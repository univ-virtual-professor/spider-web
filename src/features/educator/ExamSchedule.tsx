import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@shared/lib/firebase";
import { examResultId } from "@shared/lib/examModel";
import { useAuth } from "@app/providers/AuthProvider";
import { useEmployee } from "@shared/contexts/EmployeeContext";
import { PERMISSIONS } from "@shared/lib/rolesConfig";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Checkbox } from "@shared/ui/checkbox";
import { Switch } from "@shared/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@shared/ui/dialog";
import {
  DsPageHeader,
  DsKpiRow,
  DsCard,
  DsTableHead,
  DsTableRow,
  DsStatusPill,
  DsDetailRail,
  DsAlertStrip,
} from "@shared/ui/ds";
import { Loader2, Shuffle } from "lucide-react";

type Branch = { id: string; name: string };
type Course = { id: string; branchId: string; name: string };
type BatchOpt = { id: string; name: string };
type LessonRef = {
  moduleId: string;
  moduleTitle: string;
  lessonId: string;
  lessonTitle: string;
  plannedDate?: string;
};
type SeatAssignment = {
  studentId: string;
  studentName: string;
  batchId: string;
  seatLabel: string;
};
type ExamDoc = {
  id: string;
  title: string;
  courseId: string;
  courseName: string;
  targetBatches: string[];
  examDate: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  venue: string;
  hall: string;
  syllabusUnits: LessonRef[];
  termPlanMonth: string;
  reportCardEligible: boolean;
  status: "draft" | "published";
  seatingPlan?: SeatAssignment[];
  // Rule #1 (BUILD-NOTES §05): this collection is the source of truth for curriculum exams —
  // everything else a student is marked on (online test attempts, manual grades) is ad-hoc.
  // Marks live in the top-level `examResults` collection so a student's rank can be computed
  // with one query across everyone who sat the exam; resultsReleased gates rule #8 (students
  // only ever see released results) before a result reaches the report card.
  maxMarks?: number;
  resultsReleased?: boolean;
  resultsReleasedAt?: Timestamp;
};

export default function ExamSchedule() {
  const { profile } = useAuth();
  const educatorId: string = profile?.uid ?? "";
  const { isEmployee, hasPermission } = useEmployee();
  const canCreate = !isEmployee || hasPermission(PERMISSIONS.TESTS_CREATE);
  const canPublish = !isEmployee || hasPermission(PERMISSIONS.TESTS_PUBLISH);
  const canManageSeating = !isEmployee || hasPermission(PERMISSIONS.STUDENTS_MANAGE);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [exams, setExams] = useState<ExamDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published">("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<ExamDoc | null>(null);

  const [formCourseId, setFormCourseId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formStart, setFormStart] = useState("09:00");
  const [formEnd, setFormEnd] = useState("11:00");
  const [formVenue, setFormVenue] = useState("");
  const [formHall, setFormHall] = useState("");
  const [formReportCard, setFormReportCard] = useState(false);
  const [formBatchIds, setFormBatchIds] = useState<Set<string>>(new Set());
  const [formLessonKeys, setFormLessonKeys] = useState<Set<string>>(new Set());
  const [batches, setBatches] = useState<BatchOpt[]>([]);
  const [lessonOptions, setLessonOptions] = useState<LessonRef[]>([]);
  const [saving, setSaving] = useState(false);

  const [seatingExam, setSeatingExam] = useState<ExamDoc | null>(null);
  const [seatingStudents, setSeatingStudents] = useState<
    { id: string; name: string; batchId: string }[]
  >([]);
  const [seatAssignments, setSeatAssignments] = useState<SeatAssignment[]>([]);
  const [seatingLoading, setSeatingLoading] = useState(false);
  const [seatingSaving, setSeatingSaving] = useState(false);

  const [marksExam, setMarksExam] = useState<ExamDoc | null>(null);
  const [marksStudents, setMarksStudents] = useState<
    { id: string; name: string; batchId: string }[]
  >([]);
  const [marksValues, setMarksValues] = useState<Record<string, string>>({});
  const [marksMax, setMarksMax] = useState("");
  const [marksLoading, setMarksLoading] = useState(false);
  const [marksSaving, setMarksSaving] = useState(false);

  useEffect(() => {
    if (!educatorId) return;
    const unsub = onSnapshot(collection(db, "educators", educatorId, "branches"), (snap) => {
      setBranches(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string })));
    });
    return () => unsub();
  }, [educatorId]);

  useEffect(() => {
    if (!educatorId || branches.length === 0) {
      setLoading(false);
      return;
    }
    const unsubs = branches.map((branch) =>
      onSnapshot(
        collection(db, "educators", educatorId, "branches", branch.id, "courses"),
        (snap) => {
          const bc = snap.docs.map((d) => ({
            id: d.id,
            branchId: branch.id,
            name: d.data().name as string,
          }));
          setCourses((prev) => [...prev.filter((c) => c.branchId !== branch.id), ...bc]);
          setLoading(false);
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [branches, educatorId]);

  useEffect(() => {
    if (!educatorId) return;
    const unsub = onSnapshot(query(collection(db, "educators", educatorId, "exams")), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ExamDoc[];
      setExams(rows);
      setSelectedExamId((prev) =>
        prev && rows.some((e) => e.id === prev) ? prev : (rows[0]?.id ?? null)
      );
    });
    return () => unsub();
  }, [educatorId]);

  // Batches + syllabus units for the course selected in the create/edit form
  useEffect(() => {
    const course = courses.find((c) => c.id === formCourseId);
    if (!educatorId || !course) {
      setBatches([]);
      setLessonOptions([]);
      return;
    }
    const unsubBatches = onSnapshot(
      collection(
        db,
        "educators",
        educatorId,
        "branches",
        course.branchId,
        "courses",
        course.id,
        "batches"
      ),
      (snap) => setBatches(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string })))
    );
    const unsubModules = onSnapshot(
      collection(
        db,
        "educators",
        educatorId,
        "branches",
        course.branchId,
        "courses",
        course.id,
        "modules"
      ),
      (modSnap) => {
        const unsubs = modSnap.docs.map((modDoc) =>
          onSnapshot(
            collection(
              db,
              "educators",
              educatorId,
              "branches",
              course.branchId,
              "courses",
              course.id,
              "modules",
              modDoc.id,
              "lessons"
            ),
            (lessonSnap) => {
              const rows: LessonRef[] = lessonSnap.docs.map((l) => ({
                moduleId: modDoc.id,
                moduleTitle: String(modDoc.data().title || "Module"),
                lessonId: l.id,
                lessonTitle: String(l.data().title || "Lesson"),
                plannedDate: l.data().plannedDate || undefined,
              }));
              setLessonOptions((prev) => [
                ...prev.filter((r) => r.moduleId !== modDoc.id),
                ...rows,
              ]);
            }
          )
        );
        return () => unsubs.forEach((u) => u());
      }
    );
    return () => {
      unsubBatches();
      unsubModules();
    };
  }, [courses, formCourseId, educatorId]);

  function lessonKey(moduleId: string, lessonId: string) {
    return `${moduleId}::${lessonId}`;
  }

  function resetForm() {
    setFormCourseId("");
    setFormTitle("");
    setFormDate("");
    setFormStart("09:00");
    setFormEnd("11:00");
    setFormVenue("");
    setFormHall("");
    setFormReportCard(false);
    setFormBatchIds(new Set());
    setFormLessonKeys(new Set());
  }

  function openNew() {
    setEditingExam(null);
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(exam: ExamDoc) {
    setEditingExam(exam);
    setFormCourseId(exam.courseId);
    setFormTitle(exam.title);
    setFormDate(exam.examDate);
    setFormStart(exam.startTime);
    setFormEnd(exam.endTime);
    setFormVenue(exam.venue);
    setFormHall(exam.hall);
    setFormReportCard(exam.reportCardEligible);
    setFormBatchIds(new Set(exam.targetBatches || []));
    setFormLessonKeys(
      new Set((exam.syllabusUnits || []).map((u) => lessonKey(u.moduleId, u.lessonId)))
    );
    setDialogOpen(true);
  }

  // Business rule #2: warn (don't block) when a linked lesson's planned teach-by
  // date falls after the exam date — the syllabus wouldn't be covered in time yet.
  const publishWarningLessons = useMemo(() => {
    if (!formDate) return [];
    return lessonOptions.filter(
      (l) =>
        formLessonKeys.has(lessonKey(l.moduleId, l.lessonId)) &&
        l.plannedDate &&
        l.plannedDate > formDate
    );
  }, [lessonOptions, formLessonKeys, formDate]);

  async function saveExam(publish: boolean) {
    const course = courses.find((c) => c.id === formCourseId);
    if (!course || !formTitle.trim() || !formDate) {
      toast.error("Course, title, and date are required");
      return;
    }
    setSaving(true);
    try {
      const syllabusUnits: LessonRef[] = lessonOptions
        .filter((l) => formLessonKeys.has(lessonKey(l.moduleId, l.lessonId)))
        .map((l) => ({
          moduleId: l.moduleId,
          moduleTitle: l.moduleTitle,
          lessonId: l.lessonId,
          lessonTitle: l.lessonTitle,
          plannedDate: l.plannedDate,
        }));
      const data = {
        title: formTitle.trim(),
        courseId: course.id,
        courseName: course.name,
        targetBatches: [...formBatchIds],
        examDate: formDate,
        startTime: formStart,
        endTime: formEnd,
        venue: formVenue.trim(),
        hall: formHall.trim(),
        syllabusUnits,
        termPlanMonth: formDate.slice(0, 7),
        reportCardEligible: formReportCard,
        updatedAt: Timestamp.now(),
        ...(publish ? { status: "published" as const, publishedAt: Timestamp.now() } : {}),
      };
      if (editingExam) {
        await updateDoc(doc(db, "educators", educatorId, "exams", editingExam.id), data);
      } else {
        const ref = await addDoc(collection(db, "educators", educatorId, "exams"), {
          ...data,
          status: publish ? "published" : "draft",
          createdBy: educatorId,
          createdAt: Timestamp.now(),
        });
        setSelectedExamId(ref.id);
      }
      toast.success(publish ? "Exam published" : "Exam saved as draft");
      setDialogOpen(false);
    } catch {
      toast.error("Failed to save exam");
    } finally {
      setSaving(false);
    }
  }

  async function unpublish(exam: ExamDoc) {
    try {
      await updateDoc(doc(db, "educators", educatorId, "exams", exam.id), {
        status: "draft",
        updatedAt: Timestamp.now(),
      });
      toast.success("Exam unpublished");
    } catch {
      toast.error("Failed to unpublish");
    }
  }

  async function publishExam(exam: ExamDoc) {
    try {
      await updateDoc(doc(db, "educators", educatorId, "exams", exam.id), {
        status: "published",
        publishedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      toast.success("Published to students & parents");
    } catch {
      toast.error("Failed to publish");
    }
  }

  async function openSeating(exam: ExamDoc) {
    setSeatingExam(exam);
    setSeatAssignments(exam.seatingPlan || []);
    setSeatingLoading(true);
    try {
      const batchIds = (exam.targetBatches || []).slice(0, 30);
      if (batchIds.length === 0) {
        setSeatingStudents([]);
        return;
      }
      const snap = await getDocs(
        query(collection(db, "educators", educatorId, "students"), where("batchId", "in", batchIds))
      );
      setSeatingStudents(
        snap.docs.map((d) => ({
          id: d.id,
          name: String(d.data().name || d.data().displayName || "Unnamed"),
          batchId: d.data().batchId,
        }))
      );
    } catch {
      toast.error("Failed to load students for seating plan");
    } finally {
      setSeatingLoading(false);
    }
  }

  function autoAssignSeats() {
    const byBatch = new Map<string, typeof seatingStudents>();
    for (const s of seatingStudents) {
      const list = byBatch.get(s.batchId) || [];
      list.push(s);
      byBatch.set(s.batchId, list);
    }
    const queues = [...byBatch.values()].map((list) => [...list]);
    const interleaved: typeof seatingStudents = [];
    while (queues.some((q) => q.length > 0)) {
      for (const q of queues) {
        const next = q.shift();
        if (next) interleaved.push(next);
      }
    }
    setSeatAssignments(
      interleaved.map((s, idx) => ({
        studentId: s.id,
        studentName: s.name,
        batchId: s.batchId,
        seatLabel: String(idx + 1),
      }))
    );
  }

  function updateSeatLabel(studentId: string, label: string) {
    setSeatAssignments((prev) =>
      prev.map((a) => (a.studentId === studentId ? { ...a, seatLabel: label } : a))
    );
  }

  async function saveSeatingPlan() {
    if (!seatingExam) return;
    setSeatingSaving(true);
    try {
      await updateDoc(doc(db, "educators", educatorId, "exams", seatingExam.id), {
        seatingPlan: seatAssignments,
        updatedAt: Timestamp.now(),
      });
      toast.success("Seating plan saved");
      setSeatingExam(null);
    } catch {
      toast.error("Failed to save seating plan");
    } finally {
      setSeatingSaving(false);
    }
  }

  async function openMarks(exam: ExamDoc) {
    setMarksExam(exam);
    setMarksMax(exam.maxMarks != null ? String(exam.maxMarks) : "");
    setMarksLoading(true);
    try {
      const batchIds = (exam.targetBatches || []).slice(0, 30);
      if (batchIds.length === 0) {
        setMarksStudents([]);
        setMarksValues({});
        return;
      }
      const [studentsSnap, resultsSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, "educators", educatorId, "students"),
            where("batchId", "in", batchIds)
          )
        ),
        getDocs(query(collection(db, "examResults"), where("examId", "==", exam.id))),
      ]);
      setMarksStudents(
        studentsSnap.docs.map((d) => ({
          id: d.id,
          name: String(d.data().name || d.data().displayName || "Unnamed"),
          batchId: d.data().batchId,
        }))
      );
      const existing: Record<string, string> = {};
      resultsSnap.docs.forEach((d) => {
        const data = d.data() as any;
        existing[data.studentId] = String(data.marks ?? "");
      });
      setMarksValues(existing);
    } catch {
      toast.error("Failed to load students for marks entry");
    } finally {
      setMarksLoading(false);
    }
  }

  async function saveMarks() {
    if (!marksExam) return;
    const max = Number(marksMax);
    if (!Number.isFinite(max) || max <= 0) {
      toast.error("Enter a valid max marks for this exam");
      return;
    }
    setMarksSaving(true);
    try {
      await updateDoc(doc(db, "educators", educatorId, "exams", marksExam.id), {
        maxMarks: max,
        updatedAt: Timestamp.now(),
      });
      const entries = marksStudents.filter((s) => marksValues[s.id]?.trim());
      await Promise.all(
        entries.map((s) => {
          const marks = Number(marksValues[s.id]);
          if (!Number.isFinite(marks)) return Promise.resolve();
          return setDoc(doc(db, "examResults", examResultId(marksExam.id, s.id)), {
            examId: marksExam.id,
            educatorId,
            studentId: s.id,
            studentName: s.name,
            courseName: marksExam.courseName,
            marks,
            maxMarks: max,
            updatedAt: Timestamp.now(),
            createdAt: Timestamp.now(),
          });
        })
      );
      toast.success("Marks saved");
      setMarksExam(null);
    } catch {
      toast.error("Failed to save marks");
    } finally {
      setMarksSaving(false);
    }
  }

  async function toggleResultsReleased(exam: ExamDoc, released: boolean) {
    try {
      await updateDoc(doc(db, "educators", educatorId, "exams", exam.id), {
        resultsReleased: released,
        resultsReleasedAt: released ? Timestamp.now() : null,
        updatedAt: Timestamp.now(),
      });
      toast.success(released ? "Results released to report cards" : "Results unreleased");
    } catch {
      toast.error("Failed to update results");
    }
  }

  async function deleteExam(exam: ExamDoc) {
    if (!window.confirm(`Delete "${exam.title}"?`)) return;
    try {
      await deleteDoc(doc(db, "educators", educatorId, "exams", exam.id));
      toast.success("Exam deleted");
    } catch {
      toast.error("Failed to delete");
    }
  }

  const sortedExams = useMemo(
    () =>
      [...exams]
        .filter((e) => statusFilter === "all" || e.status === statusFilter)
        .sort((a, b) => a.examDate.localeCompare(b.examDate)),
    [exams, statusFilter]
  );
  const selectedExam = exams.find((e) => e.id === selectedExamId) || null;

  const selectedExamRisks = useMemo(() => {
    if (!selectedExam) return [];
    return (selectedExam.syllabusUnits || []).filter(
      (u) => u.plannedDate && u.plannedDate > selectedExam.examDate
    );
  }, [selectedExam]);

  const kpis = useMemo(() => {
    const total = exams.length || 1;
    const published = exams.filter((e) => e.status === "published").length;
    const withHall = exams.filter((e) => e.hall).length;
    const atRisk = exams.filter((e) =>
      (e.syllabusUnits || []).some((u) => u.plannedDate && u.plannedDate > e.examDate)
    ).length;
    return [
      {
        label: "Planned this term",
        value: String(exams.length),
        tone: "accent" as const,
        pct: 100,
      },
      {
        label: "Published",
        value: String(published),
        sub: `${exams.length - published} still draft`,
        tone: "info" as const,
        pct: (published / total) * 100,
      },
      {
        label: "Halls assigned",
        value: `${withHall} of ${exams.length}`,
        tone: "slate" as const,
        pct: (withHall / total) * 100,
      },
      {
        label: "Syllabus at risk",
        value: String(atRisk),
        tone: "accent" as const,
        pct: (atRisk / total) * 100,
      },
    ];
  }, [exams]);

  function fmtDate(d: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString(undefined, { day: "numeric", month: "short" });
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
        title="Exam schedule"
        subtitle={`Term ${new Date().getFullYear()} · ${exams.length} curriculum tests planned · ${exams.filter((e) => e.status === "published").length} published`}
        primary={canCreate ? { label: "Schedule exam", onClick: openNew } : undefined}
      />

      <DsKpiRow items={kpis} />

      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.55fr)_340px]">
        <DsCard className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-ds-ink/[.08] px-4 py-2.5">
            {(["all", "draft", "published"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={
                  "rounded-md px-2.5 py-1 font-ds-sans text-[12px] font-medium capitalize " +
                  (statusFilter === f
                    ? "bg-ds-accent/15 text-ds-accent"
                    : "text-ds-ink/50 hover:bg-ds-fill")
                }
              >
                {f}
              </button>
            ))}
            <div className="flex-1" />
            <div className="font-ds-mono text-[11.5px] text-ds-ink/45">
              Jan–Dec {new Date().getFullYear()}
            </div>
          </div>

          {sortedExams.length === 0 ? (
            <p className="py-12 text-center font-ds-sans text-[12.5px] text-ds-slate">
              No exams scheduled yet.
            </p>
          ) : (
            <>
              <DsTableHead
                columns={["Exam", "Date & time", "Venue", "Syllabus", "Status"]}
                cols="1.5fr .9fr 1fr .8fr .8fr"
              />
              {sortedExams.map((exam) => {
                const atRisk = (exam.syllabusUnits || []).some(
                  (u) => u.plannedDate && u.plannedDate > exam.examDate
                );
                return (
                  <button
                    key={exam.id}
                    onClick={() => setSelectedExamId(exam.id)}
                    className="block w-full text-left"
                  >
                    <DsTableRow
                      cols="1.5fr .9fr 1fr .8fr .8fr"
                      className={
                        exam.id === selectedExamId ? "bg-ds-fill/60" : "hover:bg-ds-fill/30"
                      }
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{exam.title}</div>
                        <div className="mt-0.5 truncate font-ds-sans text-[11px] text-ds-ink/45">
                          {exam.courseName}
                        </div>
                      </div>
                      <div
                        className={`font-ds-mono text-[11.5px] font-medium ${atRisk ? "text-ds-accent" : "text-ds-ink/70"}`}
                      >
                        {fmtDate(exam.examDate)} · {exam.startTime}
                      </div>
                      <div className="truncate text-ds-ink/70">
                        {[exam.venue, exam.hall].filter(Boolean).join(", ") || "—"}
                      </div>
                      <div className="truncate text-ds-ink/60">
                        {exam.syllabusUnits?.length ? `${exam.syllabusUnits.length} units` : "—"}
                      </div>
                      <div className="flex justify-end">
                        <DsStatusPill tone={exam.status === "published" ? "positive" : "slate"}>
                          {exam.status}
                        </DsStatusPill>
                      </div>
                    </DsTableRow>
                  </button>
                );
              })}
            </>
          )}
        </DsCard>

        <DsDetailRail>
          {selectedExam ? (
            <>
              <DsCard className="p-4">
                <div className="flex items-baseline gap-2">
                  <div className="font-ds-sans text-[14px] font-semibold text-ds-ink">
                    {selectedExam.title}
                  </div>
                  <div className="flex-1" />
                  <DsStatusPill tone={selectedExam.status === "published" ? "positive" : "accent"}>
                    {selectedExam.status}
                  </DsStatusPill>
                </div>
                <div className="mb-3 mt-1 font-ds-sans text-[11.5px] text-ds-ink/50">
                  {selectedExam.courseName}
                  {selectedExam.reportCardEligible ? " · report-card eligible" : ""}
                  {selectedExam.reportCardEligible && selectedExam.resultsReleased
                    ? " · results released"
                    : ""}
                </div>

                {[
                  [
                    "Date",
                    `${fmtDate(selectedExam.examDate)} · ${selectedExam.startTime}–${selectedExam.endTime}`,
                  ],
                  [
                    "Venue",
                    [selectedExam.venue, selectedExam.hall].filter(Boolean).join(", ") || "Not set",
                  ],
                  ["Batches", String(selectedExam.targetBatches?.length || 0)],
                  ["Seats assigned", String(selectedExam.seatingPlan?.length || 0)],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="flex justify-between gap-3 border-b border-ds-ink/[.055] py-2 font-ds-sans text-[12px] last:border-0"
                  >
                    <div className="text-ds-ink/50">{k}</div>
                    <div className="text-right font-medium text-ds-ink">{v}</div>
                  </div>
                ))}

                <div className="mb-2 mt-3.5 font-ds-sans text-[10.5px] font-medium uppercase tracking-[.05em] text-ds-ink/45">
                  Syllabus
                </div>
                {(selectedExam.syllabusUnits || []).length === 0 ? (
                  <p className="font-ds-sans text-[11.5px] text-ds-ink/40">No units linked.</p>
                ) : (
                  selectedExam.syllabusUnits.map((u) => {
                    const risky = u.plannedDate && u.plannedDate > selectedExam.examDate;
                    return (
                      <div
                        key={`${u.moduleId}-${u.lessonId}`}
                        className="flex items-center gap-2.5 border-b border-ds-ink/[.05] py-1.5 last:border-0"
                      >
                        <div
                          className={`h-2 w-2 shrink-0 rounded-sm ${risky ? "bg-ds-accent" : "bg-ds-positive"}`}
                        />
                        <div className="min-w-0">
                          <div className="truncate font-ds-sans text-[12px] font-medium text-ds-ink">
                            {u.lessonTitle}
                          </div>
                          <div className="truncate font-ds-sans text-[10.5px] text-ds-ink/45">
                            {u.moduleTitle}
                          </div>
                        </div>
                        <div className="flex-1" />
                        <div
                          className={`font-ds-mono text-[10.5px] font-medium ${risky ? "text-ds-accent" : "text-ds-ink/45"}`}
                        >
                          {risky ? "not yet taught" : "taught"}
                        </div>
                      </div>
                    );
                  })
                )}

                <div className="mt-3.5 flex flex-col gap-1.5">
                  {canCreate && (
                    <button
                      onClick={() => openEdit(selectedExam)}
                      className="h-8 rounded-md border border-ds-ink/15 font-ds-sans text-[12.5px] font-medium text-ds-ink hover:bg-ds-fill"
                    >
                      Edit exam
                    </button>
                  )}
                  {canPublish && selectedExam.status !== "published" && (
                    <button
                      onClick={() => publishExam(selectedExam)}
                      className="h-[34px] rounded-md bg-ds-accent font-ds-sans text-[12.5px] font-semibold text-white hover:bg-ds-accent/90"
                    >
                      Publish to students &amp; parents
                    </button>
                  )}
                  {canPublish && selectedExam.status === "published" && (
                    <button
                      onClick={() => unpublish(selectedExam)}
                      className="h-8 rounded-md border border-ds-ink/15 font-ds-sans text-[12.5px] font-medium text-ds-ink hover:bg-ds-fill"
                    >
                      Unpublish
                    </button>
                  )}
                  <button
                    onClick={() => openSeating(selectedExam)}
                    className="h-8 rounded-md border border-ds-ink/15 font-ds-sans text-[12.5px] font-medium text-ds-ink hover:bg-ds-fill"
                  >
                    Seating plan &amp; invigilators
                  </button>
                  {canPublish && selectedExam.status === "published" && (
                    <button
                      onClick={() => openMarks(selectedExam)}
                      className="h-8 rounded-md border border-ds-ink/15 font-ds-sans text-[12.5px] font-medium text-ds-ink hover:bg-ds-fill"
                    >
                      Record marks
                    </button>
                  )}
                  {canPublish &&
                    selectedExam.status === "published" &&
                    selectedExam.reportCardEligible && (
                      <button
                        onClick={() =>
                          toggleResultsReleased(selectedExam, !selectedExam.resultsReleased)
                        }
                        className={
                          selectedExam.resultsReleased
                            ? "h-8 rounded-md border border-ds-ink/15 font-ds-sans text-[12.5px] font-medium text-ds-ink hover:bg-ds-fill"
                            : "h-[34px] rounded-md bg-ds-positive font-ds-sans text-[12.5px] font-semibold text-white hover:bg-ds-positive/90"
                        }
                      >
                        {selectedExam.resultsReleased
                          ? "Unrelease results"
                          : "Release results to report cards"}
                      </button>
                    )}
                  {canCreate && (
                    <button
                      onClick={() => deleteExam(selectedExam)}
                      className="h-7 font-ds-sans text-[11.5px] font-medium text-ds-slate hover:text-red-600"
                    >
                      Delete exam
                    </button>
                  )}
                </div>
              </DsCard>

              {selectedExamRisks.length > 0 && (
                <DsAlertStrip
                  title="Syllabus runs ahead of class"
                  body={`${selectedExamRisks.map((u) => u.lessonTitle).join(", ")} ${selectedExamRisks.length === 1 ? "is" : "are"} on this paper but not scheduled to be taught until after ${fmtDate(selectedExam.examDate)}.`}
                  actions={[
                    { label: "Edit exam", onClick: () => openEdit(selectedExam), primary: true },
                  ]}
                />
              )}
            </>
          ) : (
            <DsCard className="p-8 text-center">
              <p className="font-ds-sans text-[12.5px] text-ds-slate">
                Select an exam to see details.
              </p>
            </DsCard>
          )}
        </DsDetailRail>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingExam ? "Edit Exam" : "New Exam"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Course</Label>
                <Select value={formCourseId} onValueChange={setFormCourseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a course" />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {branches.find((b) => b.id === c.branchId)?.name} · {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Title</Label>
                <Input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Unit Test 2 — Physics"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Report-card eligible</Label>
                <div className="flex h-10 items-center">
                  <Switch checked={formReportCard} onCheckedChange={setFormReportCard} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Start time</Label>
                <Input
                  type="time"
                  value={formStart}
                  onChange={(e) => setFormStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>End time</Label>
                <Input type="time" value={formEnd} onChange={(e) => setFormEnd(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Venue</Label>
                <Input
                  value={formVenue}
                  onChange={(e) => setFormVenue(e.target.value)}
                  placeholder="Main campus"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Hall</Label>
                <Input
                  value={formHall}
                  onChange={(e) => setFormHall(e.target.value)}
                  placeholder="Hall B"
                />
              </div>
            </div>

            {formCourseId && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Batches ({formBatchIds.size} selected)
                </p>
                {batches.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No batches for this course.</p>
                ) : (
                  <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
                    {batches.map((b) => (
                      <label
                        key={b.id}
                        className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-muted"
                      >
                        <Checkbox
                          checked={formBatchIds.has(b.id)}
                          onCheckedChange={() =>
                            setFormBatchIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(b.id)) next.delete(b.id);
                              else next.add(b.id);
                              return next;
                            })
                          }
                        />
                        <span className="text-sm">{b.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {formCourseId && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Syllabus covered ({formLessonKeys.size} selected)
                </p>
                {lessonOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No curriculum lessons for this course yet.
                  </p>
                ) : (
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
                    {lessonOptions.map((l) => {
                      const key = lessonKey(l.moduleId, l.lessonId);
                      return (
                        <label
                          key={key}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                        >
                          <Checkbox
                            checked={formLessonKeys.has(key)}
                            onCheckedChange={() =>
                              setFormLessonKeys((prev) => {
                                const next = new Set(prev);
                                if (next.has(key)) next.delete(key);
                                else next.add(key);
                                return next;
                              })
                            }
                          />
                          <span className="truncate">
                            {l.moduleTitle} · {l.lessonTitle}
                          </span>
                          {l.plannedDate && (
                            <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              plan {l.plannedDate}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {publishWarningLessons.length > 0 && (
              <DsAlertStrip
                title={`${publishWarningLessons.length} syllabus unit${publishWarningLessons.length === 1 ? "" : "s"} planned after this exam's date`}
                body={`${publishWarningLessons.map((l) => `${l.lessonTitle} (plan ${l.plannedDate})`).join(", ")}. You can still publish — this is a warning, not a hard block.`}
              />
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="secondary" disabled={saving} onClick={() => saveExam(false)}>
              Save Draft
            </Button>
            {canPublish && (
              <Button disabled={saving} onClick={() => saveExam(true)}>
                Publish
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!seatingExam} onOpenChange={(open) => !open && setSeatingExam(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Seating Plan — {seatingExam?.title}</DialogTitle>
          </DialogHeader>
          {seatingLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : seatingStudents.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No students found in this exam's target batches.
            </p>
          ) : (
            <div className="space-y-3">
              {canManageSeating && (
                <Button variant="outline" size="sm" className="gap-2" onClick={autoAssignSeats}>
                  <Shuffle className="h-3.5 w-3.5" />
                  Auto-assign (interleaved by batch)
                </Button>
              )}
              {seatAssignments.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No seating plan yet — auto-assign or add seat numbers manually.
                </p>
              ) : (
                <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-2">
                  {seatAssignments.map((a) => (
                    <div key={a.studentId} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{a.studentName}</span>
                      <Input
                        className="h-7 w-20 text-xs"
                        value={a.seatLabel}
                        disabled={!canManageSeating}
                        onChange={(e) => updateSeatLabel(a.studentId, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeatingExam(null)}>
              Close
            </Button>
            {canManageSeating && (
              <Button
                onClick={saveSeatingPlan}
                disabled={seatingSaving || seatingStudents.length === 0}
              >
                Save
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!marksExam} onOpenChange={(open) => !open && setMarksExam(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record marks — {marksExam?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Max marks</Label>
            <Input
              type="number"
              min={1}
              value={marksMax}
              onChange={(e) => setMarksMax(e.target.value)}
              placeholder="e.g. 90"
            />
          </div>
          {marksLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : marksStudents.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No students found in this exam's target batches.
            </p>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-2">
              {marksStudents.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <Input
                    className="h-7 w-20 text-xs"
                    type="number"
                    min={0}
                    value={marksValues[s.id] ?? ""}
                    onChange={(e) =>
                      setMarksValues((prev) => ({ ...prev, [s.id]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarksExam(null)}>
              Close
            </Button>
            <Button onClick={saveMarks} disabled={marksSaving || marksStudents.length === 0}>
              Save marks
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
