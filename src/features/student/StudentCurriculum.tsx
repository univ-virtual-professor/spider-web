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
import { Button } from "@shared/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@shared/ui/accordion";
import { Link } from "react-router-dom";
import { DsPageHeader, DsCard } from "@shared/ui/ds";
import { BookOpen, Eye, CheckCircle2, Circle, Loader2, FileText } from "lucide-react";
import ContentViewer from "./ContentViewer";

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
        <Loader2 className="h-6 w-6 animate-spin text-ds-slate" />
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="py-12 text-center font-ds-sans text-sm text-ds-slate">
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
    <div className="space-y-5 font-ds-sans">
      <DsPageHeader
        title="Curriculum"
        subtitle={
          totalLessons > 0
            ? `${overallPct}% complete · ${completedCount}/${totalLessons} lessons`
            : "Work through your course, module by module."
        }
      />

      {sortedModules.length === 0 ? (
        <DsCard className="p-12 text-center">
          <p className="font-ds-sans text-[12.5px] text-ds-slate">
            Your educator hasn't published a curriculum for this course yet.
          </p>
        </DsCard>
      ) : (
        <DsCard className="overflow-hidden">
          <Accordion type="multiple" defaultValue={[sortedModules[0]?.id]}>
            {sortedModules.map((mod) => {
              const lessons = [...(lessonsByModule[mod.id] || [])].sort(
                (a, b) => a.order - b.order
              );
              const modCompleted = lessons.filter((l) => completedIds.has(l.id)).length;

              return (
                <AccordionItem
                  key={mod.id}
                  value={mod.id}
                  className="border-b border-ds-ink/[.08] px-4 last:border-0"
                >
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <div className="flex w-full items-center gap-3 text-left">
                      <div className="min-w-0 flex-1">
                        <p className="font-ds-sans text-[13.5px] font-semibold text-ds-ink">
                          {mod.title}
                        </p>
                        {mod.description && (
                          <p className="font-ds-sans text-[11.5px] font-normal text-ds-ink/45">
                            {mod.description}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-md bg-ds-fill px-2 py-0.5 font-ds-mono text-[10.5px] font-medium text-ds-ink/60">
                        {modCompleted}/{lessons.length}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    <div className="border-t border-ds-ink/[.06] pt-2">
                      {lessons.map((lesson) => {
                        const done = completedIds.has(lesson.id);
                        return (
                          <div
                            key={lesson.id}
                            className="border-b border-ds-ink/[.05] py-2.5 last:border-0"
                          >
                            <div className="flex items-start gap-2.5">
                              <button
                                onClick={() => toggleComplete(lesson.id)}
                                className="mt-0.5 shrink-0 text-ds-ink/30 hover:text-ds-accent"
                                title={done ? "Mark incomplete" : "Mark complete"}
                              >
                                {done ? (
                                  <CheckCircle2 className="h-4 w-4 text-ds-positive" />
                                ) : (
                                  <Circle className="h-4 w-4" />
                                )}
                              </button>
                              <div className="min-w-0 flex-1">
                                <p
                                  className={`font-ds-sans text-[12.5px] font-medium ${done ? "text-ds-ink/40 line-through" : "text-ds-ink"}`}
                                >
                                  {lesson.title}
                                </p>
                                {lesson.description && (
                                  <p className="font-ds-sans text-[11px] text-ds-ink/45">
                                    {lesson.description}
                                  </p>
                                )}
                                {((lesson.contentIds || []).length > 0 || lesson.linkedTestId) && (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {lesson.contentIds.map((cid) => {
                                      const item = content[cid];
                                      if (!item) return null;
                                      return (
                                        <button
                                          key={cid}
                                          onClick={() => setSelectedItem(item)}
                                          className="flex h-7 items-center gap-1.5 rounded-md border border-ds-ink/15 px-2.5 font-ds-sans text-[11px] font-medium text-ds-ink hover:bg-ds-fill"
                                        >
                                          <BookOpen className="h-3 w-3" />
                                          {item.title}
                                          <Eye className="h-3 w-3" />
                                        </button>
                                      );
                                    })}
                                    {lesson.linkedTestId && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 gap-1.5 border-ds-ink/15 font-ds-sans text-[11px]"
                                        asChild
                                      >
                                        <Link to={`/student/tests/${lesson.linkedTestId}`}>
                                          <FileText className="h-3 w-3" />
                                          Take Test: {lesson.linkedTestTitle || "Test"}
                                        </Link>
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {lessons.length === 0 && (
                        <p className="font-ds-sans text-[11.5px] text-ds-ink/40">
                          No lessons in this module yet.
                        </p>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </DsCard>
      )}

      <ContentViewer
        item={selectedItem}
        studentName={profile?.displayName ?? profile?.email ?? "Student"}
        onClose={() => setSelectedItem(null)}
      />
    </div>
  );
}
