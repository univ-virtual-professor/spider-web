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
import { Card, CardContent } from "@shared/ui/card";
import { Input } from "@shared/ui/input";
import { Textarea } from "@shared/ui/textarea";
import { Badge } from "@shared/ui/badge";
import { Checkbox } from "@shared/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@shared/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@shared/ui/dialog";
import {
  Layers,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  BookOpen,
  Loader2,
} from "lucide-react";

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
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const sortedModules = [...modules].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Layers className="h-6 w-6" />
            Curriculum
          </h1>
          <p className="text-sm text-muted-foreground">
            Organize your course content into modules and lessons students can follow in order.
          </p>
        </div>
        {courses.length > 0 && (
          <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
            <SelectTrigger className="w-full sm:w-64">
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
      </div>

      {courses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Create a branch and course first (Organization) to build a curriculum.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex justify-end">
            <Button size="sm" className="gap-2" onClick={openNewModule}>
              <Plus className="h-4 w-4" />
              Add Module
            </Button>
          </div>

          {sortedModules.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No modules yet. Add your first module to start building the syllabus.
              </CardContent>
            </Card>
          ) : (
            <Accordion type="multiple" className="space-y-3">
              {sortedModules.map((mod, idx) => {
                const lessons = [...(lessonsByModule[mod.id] || [])].sort(
                  (a, b) => a.order - b.order
                );
                return (
                  <AccordionItem
                    key={mod.id}
                    value={mod.id}
                    className="rounded-xl border border-border/60 px-0"
                  >
                    <div className="flex items-center gap-2 px-4">
                      <div className="flex flex-col">
                        <button
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          onClick={() => moveModule(mod, -1)}
                          disabled={idx === 0}
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          onClick={() => moveModule(mod, 1)}
                          disabled={idx === sortedModules.length - 1}
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <AccordionTrigger className="flex-1 py-3 hover:no-underline">
                        <div className="text-left">
                          <p className="font-semibold">{mod.title}</p>
                          {mod.description && (
                            <p className="text-xs font-normal text-muted-foreground">
                              {mod.description}
                            </p>
                          )}
                        </div>
                      </AccordionTrigger>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {lessons.length} lesson{lessons.length === 1 ? "" : "s"}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => openEditModule(mod)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-destructive"
                        onClick={() => deleteModule(mod)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <AccordionContent className="px-4 pb-4">
                      <div className="space-y-2 border-t border-border/40 pt-3">
                        {lessons.map((lesson, lIdx) => (
                          <div
                            key={lesson.id}
                            className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2"
                          >
                            <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{lesson.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {(lesson.contentIds || []).length} content item
                                {(lesson.contentIds || []).length === 1 ? "" : "s"}
                              </p>
                            </div>
                            <button
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                              onClick={() => moveLesson(mod.id, lesson, -1)}
                              disabled={lIdx === 0}
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                              onClick={() => moveLesson(mod.id, lesson, 1)}
                              disabled={lIdx === lessons.length - 1}
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openEditLesson(mod.id, lesson)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => deleteLesson(mod.id, lesson)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-1 gap-2"
                          onClick={() => openNewLesson(mod.id)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add Lesson
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
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
