import { useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Textarea } from "@shared/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Plus, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { addDoc, collection, getDocs, serverTimestamp, updateDoc, doc, increment } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import FloatingInput from "@shared/ui/FloatingInput";
import { TopicMultiSelect } from "@shared/ui/topic-multi-select";
import SectionCard from "./SectionCard";

function getDifficultyLabel(level: number): string {
  if (level <= 0.3) return "Easy";
  if (level <= 0.7) return "Medium";
  return "Hard";
}

function getDifficultyColor(level: number): string {
  if (level <= 0.3) return "text-green-600";
  if (level <= 0.7) return "text-yellow-600";
  return "text-red-600";
}

function normalizeLegacyDifficulty(level?: string | number): number {
  if (typeof level === "number") return Math.max(0, Math.min(1, level));
  const s = String(level || "").toLowerCase().trim();
  if (s === "easy") return 0.15;
  if (s === "medium" || s === "general") return 0.5;
  if (s === "hard") return 0.85;
  return 0.5;
}

function clampDifficulty(level?: number) {
  if (!Number.isFinite(Number(level))) return 0.5;
  return Math.min(1, Math.max(0, Number(level)));
}

function getAverageDifficulty(sections: Array<{ difficultyLevel?: number }>, fallback = 0.5) {
  if (sections.length === 0) return fallback;
  const total = sections.reduce((acc, s) => acc + clampDifficulty(s.difficultyLevel ?? fallback), 0);
  return total / sections.length;
}

type Section = {
  id: string;
  name: string;
  questionsCount: number;
  attemptlimit: number;
  durationMinutes?: number | null;
  difficultyLevel?: number;
  topics?: string[];
  subject?: string;
  tags?: string[];
  format?: string;
  markingScheme?: {
    correct: number;
    incorrect: number;
    unanswered: number;
  } | null;
};

type CreateTemplateModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateToEdit?: any | null;
};

export default function CreateTemplateModal({ open, onOpenChange, templateToEdit }: CreateTemplateModalProps) {
  const [loading, setLoading] = useState(false);
  const isEdit = !!templateToEdit;

  const [allCourses, setAllCourses] = useState<{ id: string; name: string }[]>([]);
  const [allSubjects, setAllSubjects] = useState<{ id: string; name: string; courseId: string }[]>([]);
  const [qbTopics, setQbTopics] = useState<string[]>([]);
  const [qbTags, setQbTags] = useState<string[]>([]);
  const [courseId, setCourseId] = useState(templateToEdit?.courseId || "");
  const [courseName, setCourseName] = useState(templateToEdit?.courseName || "");
  const [subjectMode, setSubjectMode] = useState<"single" | "section_wise">(
    templateToEdit?.subjectMode || "single"
  );

  const [title, setTitle] = useState(templateToEdit?.title || "");
  const [description, setDescription] = useState(templateToEdit?.description || "");
  const [subject, setSubject] = useState(templateToEdit?.subject || "");
  const [durationMinutes, setDurationMinutes] = useState<string>(
    templateToEdit?.durationMinutes?.toString() || "60"
  );
  const [attemptsAllowed, setAttemptsAllowed] = useState<string>(
    templateToEdit?.attemptsAllowed?.toString() || "3"
  );
  const [isPublished, setIsPublished] = useState(templateToEdit?.isPublished !== false);

  const [markingScheme, setMarkingScheme] = useState({
    correct: templateToEdit?.markingScheme?.correct ?? 5,
    incorrect: templateToEdit?.markingScheme?.incorrect ?? -1,
    unanswered: templateToEdit?.markingScheme?.unanswered ?? 0,
  });

  const [syllabusTags, setSyllabusTags] = useState<string[]>(
    Array.isArray(templateToEdit?.syllabus) ? templateToEdit.syllabus : []
  );

  const [sections, setSections] = useState<Section[]>(
    templateToEdit?.sections?.length > 0
      ? templateToEdit.sections
      : [{ id: "sec_1", name: "Section 1", questionsCount: 0, attemptlimit: 0, difficultyLevel: 0.5, topics: [] }]
  );

  const computedDifficultyLevel = useMemo(() => getAverageDifficulty(sections, 0.5), [sections]);

  // Load courses, subjects, and question bank topics/tags once on first open
  useEffect(() => {
    if (!open) return;
    Promise.all([
      getDocs(collection(db, "courses")),
      getDocs(collection(db, "subjects")),
      getDocs(collection(db, "question_bank")),
    ]).then(([courseSnap, subjectSnap, qbSnap]) => {
      setAllCourses(
        courseSnap.docs
          .filter((d) => d.data()?.isActive !== false)
          .map((d) => ({ id: d.id, name: d.data().name as string }))
      );
      setAllSubjects(
        subjectSnap.docs.map((d) => ({ id: d.id, name: d.data().name as string, courseId: d.data().courseId as string }))
      );
      const topics = new Set<string>();
      const tags = new Set<string>();
      qbSnap.docs.forEach((d) => {
        const data = d.data() as any;
        (data.topics || []).forEach((t: string) => t && topics.add(t));
        if (data.topic) topics.add(data.topic);
        (data.tags || []).forEach((t: string) => t && tags.add(t));
      });
      setQbTopics(Array.from(topics).sort());
      setQbTags(Array.from(tags).sort());
    });
  }, [open]);

  // Sync state when templateToEdit changes (Edit mode)
  useEffect(() => {
    if (!open) return;
    setCourseId(templateToEdit?.courseId || "");
    setCourseName(templateToEdit?.courseName || "");
    setSubjectMode(templateToEdit?.subjectMode || "single");
    setTitle(templateToEdit?.title || "");
    setDescription(templateToEdit?.description || "");
    setSubject(templateToEdit?.subject || "");
    const baseDifficulty = normalizeLegacyDifficulty(templateToEdit?.difficultyLevel ?? templateToEdit?.level);
    setDurationMinutes(templateToEdit?.durationMinutes?.toString() || "60");
    setAttemptsAllowed(templateToEdit?.attemptsAllowed?.toString() || "3");
    setIsPublished(templateToEdit?.isPublished !== false);
    setMarkingScheme({
      correct: templateToEdit?.markingScheme?.correct ?? 5,
      incorrect: templateToEdit?.markingScheme?.incorrect ?? -1,
      unanswered: templateToEdit?.markingScheme?.unanswered ?? 0,
    });
    setSyllabusTags(Array.isArray(templateToEdit?.syllabus) ? templateToEdit.syllabus : []);
    setSections(
      templateToEdit?.sections?.length > 0
        ? templateToEdit.sections.map((s: any) => ({
          ...s,
          attemptlimit: s.attemptlimit ?? 0,
          difficultyLevel: clampDifficulty(s?.difficultyLevel ?? normalizeLegacyDifficulty(s?.difficulty ?? s?.level ?? baseDifficulty)),
          topics: Array.isArray(s?.topics) ? s.topics.map(String) : [],
          subject: s?.subject || "",
          tags: Array.isArray(s?.tags) ? s.tags : [],
          format: s?.format || "",
        }))
        : [{ id: "sec_1", name: "Section 1", questionsCount: 0, attemptlimit: 0, difficultyLevel: baseDifficulty, topics: [], subject: "", tags: [], format: "" }]
    );
  }, [open, templateToEdit]);

  const handleAddSection = () => {
    setSections([
      ...sections,
      {
        id: `sec_${Date.now()}`,
        name: `Section ${sections.length + 1}`,
        questionsCount: 0,
        attemptlimit: 0,
        difficultyLevel: computedDifficultyLevel,
        topics: [],
        subject: "",
        tags: [],
        format: "",
      },
    ]);
  };

  const handleRemoveSection = (index: number) => {
    setSections(sections.filter((_, i) => i !== index));
  };

  const handleSectionEdit = (index: number, payload: {
    name: string;
    questionsCount: number;
    attemptLimit?: number | null;
    durationMinutes?: number | null;
    difficultyLevel: number;
    topics: string[];
    markingScheme: Section["markingScheme"];
    subject: string;
    tags: string[];
    format: string;
  }) => {
    const newSections = [...sections];
    newSections[index] = {
      ...newSections[index],
      name: payload.name,
      questionsCount: payload.questionsCount,
      attemptlimit: payload.attemptLimit == null ? 0 : payload.attemptLimit,
      durationMinutes: payload.durationMinutes ?? null,
      difficultyLevel: clampDifficulty(payload.difficultyLevel),
      topics: payload.topics || [],
      markingScheme: payload.markingScheme,
      subject: payload.subject || "",
      tags: payload.tags || [],
      format: payload.format || "",
    };
    setSections(newSections);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    if (!courseId) {
      toast.error("Course is required");
      return;
    }

    if (subjectMode === "single" && !subject.trim()) {
      toast.error("Subject is required");
      return;
    }

    if (sections.length === 0) {
      toast.error("At least one section is required");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        subject: subjectMode === "single" ? subject.trim() : "",
        subjectMode,
        courseId: courseId || null,
        courseName: courseName || null,
        level: getDifficultyLabel(computedDifficultyLevel),
        difficultyLevel: computedDifficultyLevel,
        durationMinutes: Number(durationMinutes) || 0,
        attemptsAllowed: Number(attemptsAllowed) || 3,
        isPublished,
        markingScheme: {
          correct: Number(markingScheme.correct),
          incorrect: Number(markingScheme.incorrect),
          unanswered: Number(markingScheme.unanswered),
        },
        syllabus: syllabusTags,
        sections: sections.map(s => {
          const totalQ = Number(s.questionsCount) || 0;
          const attemptLimit = Math.min(
            Number(s.attemptlimit) || 0,
            totalQ
          );

          return {
            name: s.name.trim(),
            questionsCount: totalQ,
            attemptlimit: attemptLimit,
            durationMinutes: s.durationMinutes ? Number(s.durationMinutes) : null,
            difficultyLevel: clampDifficulty(s.difficultyLevel),
            topics: Array.isArray(s.topics) ? s.topics : [],
            subject: s.subject || "",
            tags: Array.isArray(s.tags) ? s.tags : [],
            format: s.format || "",
            markingScheme: s.markingScheme ? {
              correct: Number(s.markingScheme.correct),
              incorrect: Number(s.markingScheme.incorrect),
              unanswered: Number(s.markingScheme.unanswered),
            } : null,
          };
        }),

        questionsCount: sections.reduce((acc, s) => acc + (Number(s.questionsCount) || 0), 0),
        source: "admin",
        updatedAt: serverTimestamp(),
      };

      if (isEdit && templateToEdit?.id) {
        // Increment version on every edit so derived tests can detect drift
        await updateDoc(doc(db, "templates", templateToEdit.id), { ...payload, version: increment(1) });
        toast.success("Template updated successfully");
      } else {
        await addDoc(collection(db, "templates"), {
          ...payload,
          version: 1,
          createdAt: serverTimestamp(),
        });
        toast.success("Template created successfully");
      }

      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save template");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Template" : "Create New Template"}</DialogTitle>
          <DialogDescription>
            Define the default settings for this template. Educators can use these settings as a base for their custom tests.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. JEE Mains Mock" />
            </div>
            {allCourses.length > 0 && (
              <div className="space-y-2">
                <Label>Course (JEE / NEET)</Label>
                <Select
                  value={courseId}
                  onValueChange={(v) => {
                    setCourseId(v);
                    setCourseName(allCourses.find(c => c.id === v)?.name ?? "");
                    setSubject("");
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                  <SelectContent>
                    {allCourses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Subject Mode</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={subjectMode === "single" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSubjectMode("single")}
                >
                  Single Subject
                </Button>
                <Button
                  type="button"
                  variant={subjectMode === "section_wise" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSubjectMode("section_wise")}
                >
                  Section-wise
                </Button>
              </div>
            </div>
            {subjectMode === "single" && (
              <div className="space-y-2">
                <Label>Subject *</Label>
                {(() => {
                  const subjectsForCourse = courseId
                    ? allSubjects.filter(s => s.courseId === courseId)
                    : allSubjects;
                  return subjectsForCourse.length > 0 ? (
                    <Select value={subject} onValueChange={setSubject}>
                      <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                      <SelectContent>
                        {subjectsForCourse.map(s => (
                          <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Physics" />
                  );
                })()}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Template description..." />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Template Difficulty (avg of sections)</Label>
              <span className={`text-sm font-semibold min-w-[70px] mt-1 text-right ${getDifficultyColor(computedDifficultyLevel)}`}>
                {computedDifficultyLevel.toFixed(2)} — {getDifficultyLabel(computedDifficultyLevel)}
              </span>
            </div>
            <div className="space-y-2">
              <Label>Duration (min)</Label>
              <Input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} min={1} />
            </div>
            <div className="space-y-3 col-span-2">
              <h3 className="font-semibold text-sm">Marking Scheme</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                <FloatingInput
                  label="Correct"
                  type="number"
                  value={markingScheme.correct}
                  onChange={(e) =>
                    setMarkingScheme({
                      ...markingScheme,
                      correct: Number(e.target.value),
                    })
                  }
                />

                <FloatingInput
                  label="Incorrect"
                  type="number"
                  value={markingScheme.incorrect}
                  onChange={(e) =>
                    setMarkingScheme({
                      ...markingScheme,
                      incorrect: Number(e.target.value),
                    })
                  }
                />

                <FloatingInput
                  label="Unanswered"
                  type="number"
                  value={markingScheme.unanswered}
                  onChange={(e) =>
                    setMarkingScheme({
                      ...markingScheme,
                      unanswered: Number(e.target.value),
                    })
                  }
                />

              </div>
            </div>
          </div>


          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Sections *</h3>
              <Button size="sm" variant="outline" onClick={handleAddSection}><Plus className="h-4 w-4 mr-2" /> Add Section</Button>
            </div>

            {/* You can add Sections Here... This contains List of Sections added in the template */}

            {/* This is Section List */}
            {sections.map((sec, index) => {
              return <SectionCard
                key={index}
                sectionId={sec.id}
                sectionName={sec.name}
                questionCount={sec.questionsCount}
                attemptLimit={sec.attemptlimit}
                durationMinutes={sec.durationMinutes}
                sectionDifficulty={sec.difficultyLevel}
                sectionTopics={sec.topics}
                sectionSubject={sec.subject}
                sectionTags={sec.tags}
                sectionFormat={sec.format}
                availableTopics={qbTopics}
                availableTagOptions={qbTags}
                showSubjectPicker={subjectMode === "section_wise"}
                courseSubjects={allSubjects.filter(s => s.courseId === courseId)}
                markingScheme={sec.markingScheme}
                defaultMarkingScheme={markingScheme}
                onEdit={(payload) => handleSectionEdit(index, payload)}
                onRemove={() => handleRemoveSection(index)}
              />
            })}
            {/* {sections.map((sec, index) => ( */}
              {/* <div key={index} className="flex flex-col gap-3 p-3 bg-muted/10 border rounded-xl border-2 border-black">
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="flex-1 min-w-[150px] space-y-2">
                    <Label>Section Name</Label>
                    <Input value={sec.name} onChange={(e) => handleSectionChange(index, 'name', e.target.value)} />
                  </div>
                  <div className="w-24 space-y-2">
                    <Label>Questions</Label>
                    <Input type="number" value={sec.questionsCount} onChange={(e) => handleSectionChange(index, 'questionsCount', Number(e.target.value))} min={0} />
                  </div>
                  <div className="w-24 space-y-2">
                    <Label>Attempt Limit</Label>
                    <Input
                      type="number"
                      value={sec.attemptlimit || 0}
                      onChange={(e) => handleSectionChange(index, 'attemptlimit', Number(e.target.value))}
                      min={0}
                    />
                  </div>
                  <div className="w-24 space-y-2">
                    <Label>Time (opt)</Label>
                    <Input type="number" value={sec.durationMinutes || ""} onChange={(e) => handleSectionChange(index, 'durationMinutes', e.target.value ? Number(e.target.value) : null)} placeholder="min" />
                  </div>
                  <div className="w-24 space-y-2 flex flex-col">
                    <Label>Custom Marks</Label>
                    <div className="w-full h-full flex items-center justify-center pt-3 pb-2 ">
                      <Switch
                        checked={!!sec.markingScheme}
                        onCheckedChange={(checked) => {
                          handleSectionChange(index, 'markingScheme', checked ? { ...markingScheme } : null)
                        }}
                      />
                    </div>
                  </div>
                  {sections.length > 1 && (
                    <Button variant="ghost" size="icon" className="text-destructive mb-0.5" onClick={() => handleRemoveSection(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>  */}

                {/* Section Marking Scheme Override */}

                {/* {sec.markingScheme && (
                  <div className="flex items-center gap-4 bg-background p-2 rounded-lg border text-xs">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs text-green-600">Correct (+)</Label>
                        <Input
                          type="number"
                          className="h-7 w-16 text-xs"
                          value={sec.markingScheme.correct}
                          onChange={(e) => handleSectionChange(index, 'markingScheme', { ...sec.markingScheme, correct: Number(e.target.value) })}
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs text-red-500">Incorrect (-)</Label>
                        <Input
                          type="number"
                          className="h-7 w-16 text-xs"
                          value={sec.markingScheme.incorrect}
                          onChange={(e) => handleSectionChange(index, 'markingScheme', { ...sec.markingScheme, incorrect: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                  </div>
                )}  */}
              {/* </div> */}
            {/* ))}  */}
          </div>

          <div className="space-y-2">
            <Label>Syllabus Topics</Label>
            <p className="text-xs text-muted-foreground">Select topics from the question bank to associate with this template.</p>
            <TopicMultiSelect
              selectedTopics={syllabusTags}
              setSelectedTopics={setSyllabusTags}
              placeholder="Search and select topics from question bank..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="gradient-bg text-white" onClick={handleSave} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Template
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
