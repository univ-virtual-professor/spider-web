import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Textarea } from "@shared/ui/textarea";
import { Badge } from "@shared/ui/badge";
import { Checkbox } from "@shared/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@shared/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@shared/ui/dialog";
import { DsPageHeader, DsCard } from "@shared/ui/ds";
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, BookOpen, Loader2 } from "lucide-react";

type Branch = { id: string; name: string };
type Course = { id: string; branchId: string; name: string };
type ContentItem = { id: string; title: string; type: string };
type ModuleDoc = { id: string; title: string; description?: string; order: number };
type LessonDoc = {
  id: string;
  title: string;
  description?: string;
  order: number;
  contentIds: string[];
  linkedTestId?: string;
  linkedTestTitle?: string;
  /** Term-plan date this lesson is expected to be taught by (YYYY-MM-DD). Optional —
   * only set for courses using the Exam Schedule's "syllabus covered" picker, which
   * warns when an exam links a lesson planned after the exam date. */
  plannedDate?: string;
};
type TestOption = { id: string; title: string };

export default function Curriculum() {
  const { profile } = useAuth();
  const educatorId: string = profile?.uid ?? "";

  const [branches, setBranches] = useState<Branch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");

  const [modules, setModules] = useState<ModuleDoc[]>([]);
  const [lessonsByModule, setLessonsByModule] = useState<Record<string, LessonDoc[]>>({});
  const [content, setContent] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [moduleDialogOpen, setModuleDialogOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<ModuleDoc | null>(null);
  const [moduleTitle, setModuleTitle] = useState("");
  const [moduleDesc, setModuleDesc] = useState("");

  const [lessonDialogOpen, setLessonDialogOpen] = useState(false);
  const [lessonModuleId, setLessonModuleId] = useState<string>("");
  const [editingLesson, setEditingLesson] = useState<LessonDoc | null>(null);
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonDesc, setLessonDesc] = useState("");
  const [lessonContentIds, setLessonContentIds] = useState<string[]>([]);
  const [myTests, setMyTests] = useState<TestOption[]>([]);
  const [linkedTestId, setLinkedTestId] = useState<string>("none");
  const [lessonPlannedDate, setLessonPlannedDate] = useState<string>("");

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) || null;

  // Branches
  useEffect(() => {
    if (!educatorId) return;
    const unsub = onSnapshot(collection(db, "educators", educatorId, "branches"), (snap) => {
      setBranches(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string })));
    });
    return () => unsub();
  }, [educatorId]);

  // Courses per branch
  useEffect(() => {
    if (!educatorId || branches.length === 0) {
      setCourses([]);
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
    if (!selectedCourseId && courses.length > 0) {
      setSelectedCourseId(courses[0].id);
    }
  }, [courses, selectedCourseId]);

  // Modules for selected course
  useEffect(() => {
    if (!educatorId || !selectedCourse) {
      setModules([]);
      return;
    }
    const unsub = onSnapshot(
      query(
        collection(
          db,
          "educators",
          educatorId,
          "branches",
          selectedCourse.branchId,
          "courses",
          selectedCourse.id,
          "modules"
        ),
        orderBy("order", "asc")
      ),
      (snap) => {
        setModules(snap.docs.map((d) => ({ id: d.id, order: 0, title: "", ...(d.data() as any) })));
      }
    );
    return () => unsub();
  }, [educatorId, selectedCourse]);

  // Lessons per module (fan-out)
  useEffect(() => {
    if (!educatorId || !selectedCourse || modules.length === 0) {
      setLessonsByModule({});
      return;
    }
    const unsubs = modules.map((mod) =>
      onSnapshot(
        query(
          collection(
            db,
            "educators",
            educatorId,
            "branches",
            selectedCourse.branchId,
            "courses",
            selectedCourse.id,
            "modules",
            mod.id,
            "lessons"
          ),
          orderBy("order", "asc")
        ),
        (snap) => {
          const rows = snap.docs.map((d) => ({
            id: d.id,
            order: 0,
            title: "",
            contentIds: [],
            ...(d.data() as any),
          }));
          setLessonsByModule((prev) => ({ ...prev, [mod.id]: rows }));
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [educatorId, selectedCourse, modules]);

  // Content items for the selected course (for the lesson content picker)
  useEffect(() => {
    if (!educatorId || !selectedCourse) {
      setContent([]);
      return;
    }
    const unsub = onSnapshot(
      collection(
        db,
        "educators",
        educatorId,
        "branches",
        selectedCourse.branchId,
        "courses",
        selectedCourse.id,
        "content"
      ),
      (snap) => {
        setContent(
          snap.docs.map((d) => ({
            id: d.id,
            title: String(d.data().title || "Untitled"),
            type: String(d.data().type || "others"),
          }))
        );
      }
    );
    return () => unsub();
  }, [educatorId, selectedCourse]);

  function modulesRef() {
    if (!selectedCourse) return null;
    return collection(
      db,
      "educators",
      educatorId,
      "branches",
      selectedCourse.branchId,
      "courses",
      selectedCourse.id,
      "modules"
    );
  }

  function lessonsRef(moduleId: string) {
    if (!selectedCourse) return null;
    return collection(
      db,
      "educators",
      educatorId,
      "branches",
      selectedCourse.branchId,
      "courses",
      selectedCourse.id,
      "modules",
      moduleId,
      "lessons"
    );
  }

  function openNewModule() {
    setEditingModule(null);
    setModuleTitle("");
    setModuleDesc("");
    setModuleDialogOpen(true);
  }

  function openEditModule(mod: ModuleDoc) {
    setEditingModule(mod);
    setModuleTitle(mod.title);
    setModuleDesc(mod.description || "");
    setModuleDialogOpen(true);
  }

  async function saveModule() {
    const ref = modulesRef();
    if (!ref || !moduleTitle.trim()) return;
    try {
      if (editingModule) {
        await updateDoc(doc(ref, editingModule.id), {
          title: moduleTitle.trim(),
          description: moduleDesc.trim(),
          updatedAt: Timestamp.now(),
        });
      } else {
        await addDoc(ref, {
          title: moduleTitle.trim(),
          description: moduleDesc.trim(),
          order: modules.length,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      }
      setModuleDialogOpen(false);
      toast.success("Module saved");
    } catch {
      toast.error("Failed to save module");
    }
  }

  async function deleteModule(mod: ModuleDoc) {
    const ref = modulesRef();
    if (!ref) return;
    if (
      !window.confirm(`Delete module "${mod.title}"? This won't delete its lessons' content items.`)
    )
      return;
    try {
      const lessons = lessonsByModule[mod.id] || [];
      const lRef = lessonsRef(mod.id);
      if (lRef) await Promise.all(lessons.map((l) => deleteDoc(doc(lRef, l.id))));
      await deleteDoc(doc(ref, mod.id));
      toast.success("Module deleted");
    } catch {
      toast.error("Failed to delete module");
    }
  }

  async function moveModule(mod: ModuleDoc, direction: -1 | 1) {
    const ref = modulesRef();
    if (!ref) return;
    const sorted = [...modules].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((m) => m.id === mod.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    await Promise.all([
      updateDoc(doc(ref, mod.id), { order: other.order }),
      updateDoc(doc(ref, other.id), { order: mod.order }),
    ]);
  }

  async function loadMyTests() {
    if (!educatorId) return;
    try {
      const snap = await getDocs(collection(db, "educators", educatorId, "my_tests"));
      setMyTests(
        snap.docs
          .map((d) => ({
            id: d.id,
            title: String(d.data().title || "Untitled"),
            type: d.data().type,
          }))
          .filter((t: any) => t.type !== "personalized")
      );
    } catch {
      setMyTests([]);
    }
  }

  function openNewLesson(moduleId: string) {
    setLessonModuleId(moduleId);
    setEditingLesson(null);
    setLessonTitle("");
    setLessonDesc("");
    setLessonContentIds([]);
    setLinkedTestId("none");
    setLessonPlannedDate("");
    setLessonDialogOpen(true);
    loadMyTests();
  }

  function openEditLesson(moduleId: string, lesson: LessonDoc) {
    setLessonModuleId(moduleId);
    setEditingLesson(lesson);
    setLessonTitle(lesson.title);
    setLessonDesc(lesson.description || "");
    setLessonContentIds(lesson.contentIds || []);
    setLinkedTestId(lesson.linkedTestId || "none");
    setLessonPlannedDate(lesson.plannedDate || "");
    setLessonDialogOpen(true);
    loadMyTests();
  }

  async function saveLesson() {
    const ref = lessonsRef(lessonModuleId);
    if (!ref || !lessonTitle.trim()) return;
    const linkedTest = linkedTestId !== "none" ? myTests.find((t) => t.id === linkedTestId) : null;
    try {
      if (editingLesson) {
        await updateDoc(doc(ref, editingLesson.id), {
          title: lessonTitle.trim(),
          description: lessonDesc.trim(),
          contentIds: lessonContentIds,
          linkedTestId: linkedTest?.id || null,
          linkedTestTitle: linkedTest?.title || null,
          plannedDate: lessonPlannedDate || null,
          updatedAt: Timestamp.now(),
        });
      } else {
        const existing = lessonsByModule[lessonModuleId] || [];
        await addDoc(ref, {
          title: lessonTitle.trim(),
          description: lessonDesc.trim(),
          contentIds: lessonContentIds,
          linkedTestId: linkedTest?.id || null,
          linkedTestTitle: linkedTest?.title || null,
          plannedDate: lessonPlannedDate || null,
          order: existing.length,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      }
      setLessonDialogOpen(false);
      toast.success("Lesson saved");
    } catch {
      toast.error("Failed to save lesson");
    }
  }

  async function deleteLesson(moduleId: string, lesson: LessonDoc) {
    const ref = lessonsRef(moduleId);
    if (!ref) return;
    if (!window.confirm(`Delete lesson "${lesson.title}"?`)) return;
    try {
      await deleteDoc(doc(ref, lesson.id));
      toast.success("Lesson deleted");
    } catch {
      toast.error("Failed to delete lesson");
    }
  }

  async function moveLesson(moduleId: string, lesson: LessonDoc, direction: -1 | 1) {
    const ref = lessonsRef(moduleId);
    if (!ref) return;
    const sorted = [...(lessonsByModule[moduleId] || [])].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((l) => l.id === lesson.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    await Promise.all([
      updateDoc(doc(ref, lesson.id), { order: other.order }),
      updateDoc(doc(ref, other.id), { order: lesson.order }),
    ]);
  }

  function toggleContentId(id: string) {
    setLessonContentIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-ds-slate" />
      </div>
    );
  }

  const sortedModules = [...modules].sort((a, b) => a.order - b.order);
  const totalLessons = Object.values(lessonsByModule).reduce((sum, l) => sum + l.length, 0);

  return (
    <div className="space-y-5 font-ds-sans">
      <DsPageHeader
        title="Curriculum"
        subtitle={
          selectedCourse
            ? `${sortedModules.length} modules · ${totalLessons} lessons`
            : "Organize your course content into modules and lessons."
        }
        primary={
          courses.length > 0
            ? {
                label: "Add module",
                icon: <Plus className="mr-1 h-3.5 w-3.5" />,
                onClick: openNewModule,
              }
            : undefined
        }
      />

      {courses.length === 0 ? (
        <DsCard className="p-12 text-center">
          <p className="font-ds-sans text-[12.5px] text-ds-slate">
            Create a branch and course first (Organization) to build a curriculum.
          </p>
        </DsCard>
      ) : (
        <>
          {courses.length > 1 && (
            <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
              <SelectTrigger className="h-9 w-full border-ds-ink/15 sm:w-64">
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
          )}

          {sortedModules.length === 0 ? (
            <DsCard className="p-12 text-center">
              <p className="font-ds-sans text-[12.5px] text-ds-slate">
                No modules yet. Add your first module to start building the syllabus.
              </p>
            </DsCard>
          ) : (
            <DsCard className="overflow-hidden">
              <Accordion type="multiple">
                {sortedModules.map((mod, idx) => {
                  const lessons = [...(lessonsByModule[mod.id] || [])].sort(
                    (a, b) => a.order - b.order
                  );
                  return (
                    <AccordionItem
                      key={mod.id}
                      value={mod.id}
                      className="border-b border-ds-ink/[.08] px-0 last:border-0"
                    >
                      <div className="flex items-center gap-2 px-4">
                        <div className="flex flex-col">
                          <button
                            className="text-ds-ink/35 hover:text-ds-ink disabled:opacity-30"
                            onClick={() => moveModule(mod, -1)}
                            disabled={idx === 0}
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="text-ds-ink/35 hover:text-ds-ink disabled:opacity-30"
                            onClick={() => moveModule(mod, 1)}
                            disabled={idx === sortedModules.length - 1}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <AccordionTrigger className="flex-1 py-3 hover:no-underline">
                          <div className="text-left">
                            <p className="font-ds-sans text-[13.5px] font-semibold text-ds-ink">
                              {mod.title}
                            </p>
                            {mod.description && (
                              <p className="font-ds-sans text-[11.5px] font-normal text-ds-ink/45">
                                {mod.description}
                              </p>
                            )}
                          </div>
                        </AccordionTrigger>
                        <span className="shrink-0 rounded-md bg-ds-fill px-2 py-0.5 font-ds-mono text-[10.5px] font-medium text-ds-ink/60">
                          {lessons.length} lesson{lessons.length === 1 ? "" : "s"}
                        </span>
                        <button
                          className="shrink-0 rounded p-1.5 text-ds-slate hover:bg-ds-fill"
                          onClick={() => openEditModule(mod)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="shrink-0 rounded p-1.5 text-ds-slate hover:bg-ds-fill hover:text-red-600"
                          onClick={() => deleteModule(mod)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <AccordionContent className="px-4 pb-3">
                        <div className="border-t border-ds-ink/[.06] pt-2">
                          {lessons.map((lesson, lIdx) => (
                            <div
                              key={lesson.id}
                              className="flex items-center gap-2.5 border-b border-ds-ink/[.05] py-2 last:border-0"
                            >
                              <div className="h-2 w-2 shrink-0 rounded-sm bg-ds-info" />
                              <BookOpen className="h-3.5 w-3.5 shrink-0 text-ds-ink/35" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-ds-sans text-[12.5px] font-medium text-ds-ink">
                                  {lesson.title}
                                </p>
                                <p className="font-ds-sans text-[11px] text-ds-ink/45">
                                  {(lesson.contentIds || []).length} content item
                                  {(lesson.contentIds || []).length === 1 ? "" : "s"}
                                  {lesson.plannedDate && ` · plan ${lesson.plannedDate}`}
                                </p>
                              </div>
                              <button
                                className="text-ds-ink/30 hover:text-ds-ink disabled:opacity-30"
                                onClick={() => moveLesson(mod.id, lesson, -1)}
                                disabled={lIdx === 0}
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                className="text-ds-ink/30 hover:text-ds-ink disabled:opacity-30"
                                onClick={() => moveLesson(mod.id, lesson, 1)}
                                disabled={lIdx === lessons.length - 1}
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                className="rounded p-1 text-ds-slate hover:bg-ds-fill"
                                onClick={() => openEditLesson(mod.id, lesson)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                className="rounded p-1 text-ds-slate hover:bg-ds-fill hover:text-red-600"
                                onClick={() => deleteLesson(mod.id, lesson)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => openNewLesson(mod.id)}
                            className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-ds-ink/20 font-ds-sans text-[12px] font-medium text-ds-ink/50 hover:border-ds-ink/35"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add lesson
                          </button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </DsCard>
          )}
        </>
      )}

      {/* Module dialog */}
      <Dialog open={moduleDialogOpen} onOpenChange={setModuleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingModule ? "Edit Module" : "Add Module"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Module title"
              value={moduleTitle}
              onChange={(e) => setModuleTitle(e.target.value)}
            />
            <Textarea
              placeholder="Description (optional)"
              value={moduleDesc}
              onChange={(e) => setModuleDesc(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModuleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveModule} disabled={!moduleTitle.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lesson dialog */}
      <Dialog open={lessonDialogOpen} onOpenChange={setLessonDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLesson ? "Edit Lesson" : "Add Lesson"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Lesson title"
              value={lessonTitle}
              onChange={(e) => setLessonTitle(e.target.value)}
            />
            <Textarea
              placeholder="Description (optional)"
              value={lessonDesc}
              onChange={(e) => setLessonDesc(e.target.value)}
              rows={2}
            />
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Attach content ({lessonContentIds.length} selected)
              </p>
              {content.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No content uploaded for this course yet.
                </p>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                  {content.map((item) => (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        checked={lessonContentIds.includes(item.id)}
                        onCheckedChange={() => toggleContentId(item.id)}
                      />
                      <span className="truncate">{item.title}</span>
                      <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
                        {item.type}
                      </Badge>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Link a test (optional)
              </p>
              <Select value={linkedTestId} onValueChange={setLinkedTestId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {myTests.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Planned teach-by date (optional)
              </p>
              <Input
                type="date"
                value={lessonPlannedDate}
                onChange={(e) => setLessonPlannedDate(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Used by Exam Schedule to warn if an exam covers this lesson before it's taught.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLessonDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveLesson} disabled={!lessonTitle.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
