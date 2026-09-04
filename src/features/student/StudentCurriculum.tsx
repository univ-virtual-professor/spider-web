import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Timestamp,
} from "firebase/firestore";

import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { Card, CardContent } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Progress } from "@shared/ui/progress";
import { Button } from "@shared/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@shared/ui/accordion";
import { Layers, BookOpen, Eye, CheckCircle2, Circle, Loader2 } from "lucide-react";
import ContentViewer from "./ContentViewer";

type ModuleDoc = { id: string; title: string; description?: string; order: number };
type LessonDoc = {
  id: string;
  title: string;
  description?: string;
  order: number;
  contentIds: string[];
};
type ContentItem = {
  id: string;
  type: string;
  title: string;
  description?: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType?: string;
  source: "educator" | "admin_library";
  createdAt: Timestamp;
};

export default function StudentCurriculum() {
  const { profile } = useAuth();
  const educatorId: string = profile?.educatorId ?? "";
  const branchId: string = profile?.branchId ?? "";
  const courseId: string = profile?.courseId ?? "";
  const uid: string = profile?.uid ?? "";

  const [modules, setModules] = useState<ModuleDoc[]>([]);
  const [lessonsByModule, setLessonsByModule] = useState<Record<string, LessonDoc[]>>({});
  const [content, setContent] = useState<Record<string, ContentItem>>({});
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);

  const ready = !!(educatorId && branchId && courseId);

  useEffect(() => {
    if (!ready) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      query(
        collection(
          db,
          "educators",
          educatorId,
          "branches",
          branchId,
          "courses",
          courseId,
          "modules"
        ),
        orderBy("order", "asc")
      ),
      (snap) => {
        setModules(snap.docs.map((d) => ({ id: d.id, order: 0, title: "", ...(d.data() as any) })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [ready, educatorId, branchId, courseId]);

  useEffect(() => {
    if (!ready || modules.length === 0) {
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
            branchId,
            "courses",
            courseId,
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
  }, [ready, modules, educatorId, branchId, courseId]);

  useEffect(() => {
    if (!ready) return;
    const unsub = onSnapshot(
      collection(db, "educators", educatorId, "branches", branchId, "courses", courseId, "content"),
      (snap) => {
        const map: Record<string, ContentItem> = {};
        snap.docs.forEach((d) => {
          map[d.id] = { id: d.id, ...(d.data() as Omit<ContentItem, "id">) };
        });
        setContent(map);
      }
    );
    return () => unsub();
  }, [ready, educatorId, branchId, courseId]);

  useEffect(() => {
    if (!educatorId || !uid) return;
    const unsub = onSnapshot(
      collection(db, "educators", educatorId, "students", uid, "lessonProgress"),
      (snap) => setCompletedIds(new Set(snap.docs.map((d) => d.id)))
    );
    return () => unsub();
  }, [educatorId, uid]);

  async function toggleComplete(lessonId: string) {
    if (!educatorId || !uid) return;
    const ref = doc(db, "educators", educatorId, "students", uid, "lessonProgress", lessonId);
    if (completedIds.has(lessonId)) {
      await deleteDoc(ref);
    } else {
      await setDoc(ref, { completed: true, completedAt: Timestamp.now() });
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Your course isn't set up yet — check back once you're enrolled.
      </div>
    );
  }

  const allLessons = modules.flatMap((m) => lessonsByModule[m.id] || []);
  const totalLessons = allLessons.length;
  const completedCount = allLessons.filter((l) => completedIds.has(l.id)).length;
  const overallPct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  const sortedModules = [...modules].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Layers className="h-6 w-6" />
          Curriculum
        </h1>
        <p className="text-sm text-muted-foreground">Work through your course, module by module.</p>
      </div>

      {totalLessons > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">Overall progress</span>
              <span className="text-muted-foreground">
                {completedCount}/{totalLessons} lessons · {overallPct}%
              </span>
            </div>
            <Progress value={overallPct} />
          </CardContent>
        </Card>
      )}

      {sortedModules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Your educator hasn't published a curriculum for this course yet.
          </CardContent>
        </Card>
      ) : (
        <Accordion type="multiple" defaultValue={[sortedModules[0]?.id]} className="space-y-3">
          {sortedModules.map((mod) => {
            const lessons = [...(lessonsByModule[mod.id] || [])].sort((a, b) => a.order - b.order);
            const modCompleted = lessons.filter((l) => completedIds.has(l.id)).length;
            const modPct =
              lessons.length > 0 ? Math.round((modCompleted / lessons.length) * 100) : 0;

            return (
              <AccordionItem
                key={mod.id}
                value={mod.id}
                className="rounded-xl border border-border/60 px-4"
              >
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="flex w-full items-center gap-3 text-left">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{mod.title}</p>
                      {mod.description && (
                        <p className="text-xs font-normal text-muted-foreground">
                          {mod.description}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {modCompleted}/{lessons.length}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <Progress value={modPct} className="mb-3 h-1.5" />
                  <div className="space-y-2">
                    {lessons.map((lesson) => {
                      const done = completedIds.has(lesson.id);
                      return (
                        <div
                          key={lesson.id}
                          className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5"
                        >
                          <div className="flex items-start gap-2">
                            <button
                              onClick={() => toggleComplete(lesson.id)}
                              className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary"
                              title={done ? "Mark incomplete" : "Mark complete"}
                            >
                              {done ? (
                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                              ) : (
                                <Circle className="h-5 w-5" />
                              )}
                            </button>
                            <div className="min-w-0 flex-1">
                              <p
                                className={`text-sm font-medium ${done ? "text-muted-foreground line-through" : ""}`}
                              >
                                {lesson.title}
                              </p>
                              {lesson.description && (
                                <p className="text-xs text-muted-foreground">
                                  {lesson.description}
                                </p>
                              )}
                              {(lesson.contentIds || []).length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {lesson.contentIds.map((cid) => {
                                    const item = content[cid];
                                    if (!item) return null;
                                    return (
                                      <Button
                                        key={cid}
                                        size="sm"
                                        variant="outline"
                                        className="h-7 gap-1.5 text-xs"
                                        onClick={() => setSelectedItem(item)}
                                      >
                                        <BookOpen className="h-3 w-3" />
                                        {item.title}
                                        <Eye className="h-3 w-3" />
                                      </Button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {lessons.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No lessons in this module yet.
                      </p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      <ContentViewer
        item={selectedItem}
        studentName={profile?.displayName ?? profile?.email ?? "Student"}
        onClose={() => setSelectedItem(null)}
      />
    </div>
  );
}
