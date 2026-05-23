import { useEffect, useState, useRef } from "react";
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  limit,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { useEducatorFeatures } from "@shared/hooks/useEducatorFeatures";
import { toast } from "sonner";
import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Label } from "@shared/ui/label";
import { Input } from "@shared/ui/input";
import { Checkbox } from "@shared/ui/checkbox";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Lock, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { uploadToImageKit } from "@shared/lib/imagekitUpload";

// ─── Types ────────────────────────────────────────────────────────────────────

type ContentItem = {
  id: string;
  title: string;
  type: string;
  courseId: string;
  courseName: string;
  branchId: string;
  branchName: string;
};

type DppRecord = {
  id: string;
  title: string;
  difficulty: string;
  contentTitles: string[];
  generatedAt: string;
  status: "generating" | "ready" | "failed";
  testId: string | null;
  errorMessage?: string;
  sourceMode?: string;
  targetBatches?: string[];
};

type ScheduleRecord = {
  id: string;
  contentTitles: string[];
  difficulty: string;
  startDate: string;
  endDate: string;
  timeOfDay: string;
  targetBatches: string[];
  isActive: boolean;
  lastRunDate: string | null;
  sourceMode?: string;
  topicRotation?: string[];
  topicFilters?: string[];
  subjectFilter?: string;
  chapterFilter?: string;
};

type Batch = { id: string; name: string };

type SourceMode = "upload" | "content" | "qb";

const MONKEY_KING = import.meta.env.VITE_MONKEY_KING_API_URL || "";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(firebaseUser: any, path: string, opts: RequestInit = {}) {
  const token = await firebaseUser.getIdToken();
  return fetch(`${MONKEY_KING}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...opts.headers,
    },
  });
}

function StatusBadge({ status }: { status: DppRecord["status"] }) {
  if (status === "generating")
    return (
      <Badge variant="secondary" className="shrink-0 gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Generating
      </Badge>
    );
  if (status === "ready")
    return (
      <Badge variant="default" className="shrink-0 gap-1 bg-green-600">
        <CheckCircle2 className="h-3 w-3" /> Ready
      </Badge>
    );
  return (
    <Badge variant="destructive" className="shrink-0 gap-1">
      <AlertCircle className="h-3 w-3" /> Failed
    </Badge>
  );
}

function SourceLabel({ mode }: { mode?: string }) {
  if (mode === "qb") return <span className="text-xs text-muted-foreground">Question Bank</span>;
  if (mode === "content") return <span className="text-xs text-muted-foreground">Content</span>;
  return <span className="text-xs text-muted-foreground">Upload</span>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DppGenerator() {
  const { firebaseUser } = useAuth();
  const educatorUid = firebaseUser?.uid || "";
  const { features, loading: featuresLoading } = useEducatorFeatures(educatorUid);

  const [content, setContent] = useState<ContentItem[]>([]);
  const [loadingContent, setLoadingContent] = useState(true);

  const [dpps, setDpps] = useState<DppRecord[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(true);
  const [usageToday, setUsageToday] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(3);

  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());

  const [genSource, setGenSource] = useState<SourceMode>("upload");
  const [genSelectedIds, setGenSelectedIds] = useState<Set<string>>(new Set());
  const [genTopicFilters, setGenTopicFilters] = useState<string[]>([]);
  const [genSubject, setGenSubject] = useState("");
  const [genChapter, setGenChapter] = useState("");
  const [genTopicInput, setGenTopicInput] = useState("");
  const [genDifficulty, setGenDifficulty] = useState("medium");
  const [genTopicName, setGenTopicName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genNumQuestions, setGenNumQuestions] = useState<number>(10);

  // File upload state for 'upload' mode
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scheduling state
  const [isScheduled, setIsScheduled] = useState(false);
  const [schedDays, setSchedDays] = useState<number>(1);
  const [schedTime, setSchedTime] = useState("08:00");

  type CourseOption = {
    courseId: string;
    courseName: string;
    branchId: string;
    branchName: string;
  };
  const [coursesList, setCoursesList] = useState<CourseOption[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");

  // Load content & branches
  useEffect(() => {
    if (!educatorUid) return;
    setLoadingContent(true);
    const items: ContentItem[] = [];
    const uniqueCourses: CourseOption[] = [];
    const seenCourseKeys = new Set<string>();

    getDocs(collection(db, "educators", educatorUid, "branches"))
      .then(async (branchSnap) => {
        const loadedBranches = branchSnap.docs.map((d) => ({
          id: d.id,
          name: (d.data() as any).name || d.id,
        }));
        setBranches(loadedBranches);
        if (loadedBranches.length === 1) {
          setSelectedBranchId(loadedBranches[0].id);
        }

        for (const bDoc of branchSnap.docs) {
          const branchName = (bDoc.data() as any).name || bDoc.id;
          const courseSnap = await getDocs(
            collection(db, "educators", educatorUid, "branches", bDoc.id, "courses")
          );
          for (const cDoc of courseSnap.docs) {
            const courseName = (cDoc.data() as any).name || cDoc.id;
            const courseKey = `${bDoc.id}::${cDoc.id}`;
            if (!seenCourseKeys.has(courseKey)) {
              seenCourseKeys.add(courseKey);
              uniqueCourses.push({
                courseId: cDoc.id,
                courseName,
                branchId: bDoc.id,
                branchName,
              });
            }

            const contentSnap = await getDocs(
              collection(
                db,
                "educators",
                educatorUid,
                "branches",
                bDoc.id,
                "courses",
                cDoc.id,
                "content"
              )
            );
            for (const ctDoc of contentSnap.docs) {
              const d = ctDoc.data() as any;
              items.push({
                id: ctDoc.id,
                title: d.title || ctDoc.id,
                type: d.type || "book",
                courseId: cDoc.id,
                courseName,
                branchId: bDoc.id,
                branchName,
              });
            }
          }
        }
      })
      .catch(() => toast.error("Failed to load content"))
      .finally(() => {
        setContent(items.sort((a, b) => b.id.localeCompare(a.id)));
        setCoursesList(uniqueCourses);
        setLoadingContent(false);
      });
  }, [educatorUid]);

  // Auto-select the first program when the branch or coursesList changes
  useEffect(() => {
    if (selectedBranchId) {
      const firstCourse = coursesList.find((c) => c.branchId === selectedBranchId);
      if (firstCourse) {
        setSelectedCourseId(firstCourse.courseId);
      } else {
        setSelectedCourseId("");
      }
    } else {
      setSelectedCourseId("");
    }
  }, [selectedBranchId, coursesList]);

  // Load batches when a branch/course is selected
  useEffect(() => {
    if (!educatorUid || !selectedBranchId || !selectedCourseId) {
      setBatches([]);
      return;
    }

    getDocs(
      collection(
        db,
        "educators",
        educatorUid,
        "branches",
        selectedBranchId,
        "courses",
        selectedCourseId,
        "batches"
      )
    )
      .then((snap) => {
        const loadedBatches = snap.docs.map((d) => ({
          id: d.id,
          name: (d.data() as any).name || d.id,
        }));
        setBatches(loadedBatches);
        if (loadedBatches.length === 1) {
          setSelectedBatchIds(new Set([loadedBatches[0].id]));
        } else {
          setSelectedBatchIds(new Set());
        }
      })
      .catch(() => {});
  }, [educatorUid, selectedBranchId, selectedCourseId]);

  // ── Realtime DPP listener ──────────────────────────────────────────────────
  useEffect(() => {
    if (!educatorUid) return;
    return onSnapshot(
      query(
        collection(db, "educators", educatorUid, "dpps"),
        orderBy("generatedAt", "desc"),
        limit(10)
      ),
      (snap) => setDpps(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );
  }, [educatorUid]);

  // ── Load usage + schedules ─────────────────────────────────────────────────
  useEffect(() => {
    if (!firebaseUser) return;
    firebaseUser.getIdToken().then((token: string) => {
      fetch(`${MONKEY_KING}/api/dpp/usage`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => {
          setUsageToday(d.usedToday ?? 0);
          setDailyLimit(d.dailyLimit ?? 3);
        })
        .catch(() => {});
    });
  }, [firebaseUser, dpps.length]);

  useEffect(() => {
    if (!firebaseUser) return;
    setLoadingSchedules(true);
    firebaseUser.getIdToken().then((token: string) => {
      fetch(`${MONKEY_KING}/api/dpp/schedules`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => setSchedules(Array.isArray(d) ? d : []))
        .catch(() => {})
        .finally(() => setLoadingSchedules(false));
    });
  }, [firebaseUser]);

  // ── Generate helpers ───────────────────────────────────────────────────
  const genSelectedContent = content.filter((c) => genSelectedIds.has(c.id));
  const courseObj = coursesList.find(
    (c) => c.courseId === selectedCourseId && c.branchId === selectedBranchId
  );
  const genCourseId = selectedCourseId;

  // BUG 4 FIX: require courseObj to be defined before enabling the generate button
  const canGenerate =
    !generating &&
    !uploading &&
    !!courseObj &&
    usageToday < dailyLimit &&
    ((genSource === "upload" && !!uploadFile) ||
      (genSource === "content" && genSelectedIds.size > 0) ||
      (genSource === "qb" && (genTopicFilters.length > 0 || !!genSubject || !!genTopicName)));

  const performGeneration = async (finalContentIds: string[], finalContentTitles: string[]) => {
    if (!firebaseUser) return;

    if (isScheduled) {
      // Create a schedule
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(startDate.getDate() + (schedDays - 1));

      const batchNames = [...selectedBatchIds].map(
        (id) => batches.find((b) => b.id === id)?.name || id
      );
      const customTitle = genTopicName.trim()
        ? `DPP - ${genTopicName.trim()} (${batchNames.join(", ")})`
        : `DPP (${batchNames.join(", ")})`;

      const res = await apiFetch(firebaseUser, "/api/dpp/schedules", {
        method: "POST",
        body: JSON.stringify({
          content_ids: finalContentIds,
          content_titles: finalContentTitles,
          course_id: genCourseId,
          source_mode: genSource,
          topic_filters: genTopicFilters,
          subject_filter: genSubject,
          chapter_filter: genChapter,
          difficulty: genDifficulty,
          target_batches: [...selectedBatchIds],
          start_date: startDate.toISOString().split("T")[0],
          end_date: endDate.toISOString().split("T")[0],
          time_of_day: schedTime,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          topic_rotation: [],
          num_questions: genNumQuestions,
          topic_hint: genTopicName.trim(),
          title: customTitle,
          type: "dpp",
          folderId: "dpp_folder",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "Failed to save schedule");

      // BUG 3 FIX: resolve scheduleId defensively — backend may return any of these keys
      const schedId = data.scheduleId ?? data.id ?? data.schedule_id;
      if (!schedId) throw new Error("No schedule ID returned from server");

      toast.success("DPP Schedule activated!");
      setSchedules((prev) => [
        {
          id: schedId,
          contentTitles: finalContentTitles,
          difficulty: genDifficulty,
          startDate: startDate.toISOString().split("T")[0],
          endDate: endDate.toISOString().split("T")[0],
          timeOfDay: schedTime,
          targetBatches: [...selectedBatchIds],
          isActive: true,
          lastRunDate: null,
          sourceMode: genSource,
        },
        ...prev,
      ]);
    } else {
      // Immediate generation
      const batchNames = [...selectedBatchIds].map(
        (id) => batches.find((b) => b.id === id)?.name || id
      );
      const customTitle = genTopicName.trim()
        ? `DPP - ${genTopicName.trim()} (${batchNames.join(", ")})`
        : `DPP (${batchNames.join(", ")})`;

      const res = await apiFetch(firebaseUser, "/api/dpp/generate", {
        method: "POST",
        body: JSON.stringify({
          content_ids: finalContentIds,
          content_titles: finalContentTitles,
          difficulty: genDifficulty,
          course_id: genCourseId,
          topic_hint: genTopicName.trim(),
          source_mode: genSource,
          topic_filters: genTopicFilters,
          subject_filter: genSubject,
          chapter_filter: genChapter,
          target_batches: [...selectedBatchIds],
          num_questions: genNumQuestions,
          title: customTitle,
          type: "dpp",
          folderId: "dpp_folder",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "Generation failed");
      toast.success("DPP generation started — check the list below");
      setUsageToday((p) => p + 1);
    }

    // Reset forms
    setGenSelectedIds(new Set());
    setGenTopicName("");
    setUploadFile(null);
    setUploadTitle("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleGenerate = async () => {
    if (!canGenerate || !firebaseUser) return;

    // BUG 4 FIX: explicit course guard with user-visible error before any async work
    if (!genCourseId) {
      toast.error("Please select a course before generating");
      return;
    }

    setGenerating(true);
    try {
      let finalContentIds = [...genSelectedIds];
      let finalContentTitles = genSelectedContent.map((c) => c.title);

      if (genSource === "upload" && uploadFile && courseObj) {
        setUploading(true);
        const result = await uploadToImageKit(
          uploadFile,
          uploadFile.name,
          `/content/educator/${educatorUid}`,
          "content"
        );
        const docRef = await addDoc(
          collection(
            db,
            "educators",
            educatorUid,
            "branches",
            courseObj.branchId,
            "courses",
            courseObj.courseId,
            "content"
          ),
          {
            type: "note",
            title: uploadTitle.trim() || uploadFile.name,
            fileUrl: result.url,
            fileId: result.fileId,
            fileName: uploadFile.name,
            fileSize: uploadFile.size,
            mimeType: uploadFile.type,
            source: "educator",
            addedBy: educatorUid,
            createdAt: serverTimestamp(),
          }
        );
        finalContentIds = [docRef.id];
        finalContentTitles = [uploadTitle.trim() || uploadFile.name];
        setUploading(false);
      }

      await performGeneration(finalContentIds, finalContentTitles);
    } catch (e: any) {
      console.log(e.message);
      toast.error(e?.message || "Failed to process DPP");
      setUploading(false);
    } finally {
      setGenerating(false);
    }
  };

  const toggleScheduleActive = async (schedId: string, current: boolean) => {
    if (!firebaseUser) return;
    try {
      const res = await apiFetch(firebaseUser, `/api/dpp/schedules/${schedId}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !current }),
      });
      if (!res.ok) throw new Error();
      setSchedules((prev) =>
        prev.map((s) => (s.id === schedId ? { ...s, isActive: !current } : s))
      );
    } catch {
      toast.error("Failed to update schedule");
    }
  };

  const deleteSchedule = async (schedId: string) => {
    if (!firebaseUser) return;
    try {
      const res = await apiFetch(firebaseUser, `/api/dpp/schedules/${schedId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setSchedules((prev) => prev.filter((s) => s.id !== schedId));
      toast.success("Schedule deleted");
    } catch {
      toast.error("Failed to delete schedule");
    }
  };

  if (!featuresLoading && !features.dpp) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <Lock className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">DPP Generator not included in your plan</h2>
        <p className="max-w-sm text-muted-foreground">
          Upgrade to generate AI-powered daily practice papers.
        </p>
      </div>
    );
  }

  const toggleBatch = (id: string) => {
    setSelectedBatchIds((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Zap className="h-6 w-6 text-primary" /> DPP Generator
          </h1>
          <p className="text-sm text-muted-foreground">Daily practice papers for your students</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">DPP Settings</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {usageToday}/{dailyLimit} used today
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Branch & Batch Selection */}
              <div className="grid grid-cols-2 gap-4">
                {branches.length > 1 && (
                  <div className="w-full space-y-1.5">
                    <Label>Choose Branch</Label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                      value={selectedBranchId}
                      onChange={(e) => setSelectedBranchId(e.target.value)}
                    >
                      <option value="">Select branch...</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedBranchId && (
                  <div className={`w-full space-y-1.5 ${branches.length <= 1 ? "col-span-2" : ""}`}>
                    <Label>Choose Program</Label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                      value={selectedCourseId}
                      onChange={(e) => setSelectedCourseId(e.target.value)}
                    >
                      <option value="">Select program...</option>
                      {coursesList
                        .filter((c) => c.branchId === selectedBranchId)
                        .map((c) => (
                          <option key={c.courseId} value={c.courseId}>
                            {c.courseName}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
                {batches.length > 1 && (
                  <div className="col-span-2 space-y-1.5">
                    <Label>Choose Batch</Label>
                    <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
                      {batches.map((b) => (
                        <label
                          key={b.id}
                          className="flex cursor-pointer items-center gap-2 rounded p-1.5 hover:bg-muted"
                        >
                          <Checkbox
                            checked={selectedBatchIds.has(b.id)}
                            onCheckedChange={() => toggleBatch(b.id)}
                          />
                          <span className="text-sm">{b.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Source Type */}
              <div className="space-y-1.5">
                <Label>Source</Label>
                <div className="flex gap-2">
                  {(["upload", "content", "qb"] as SourceMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setGenSource(m);
                        setGenSelectedIds(new Set());
                      }}
                      className={`flex-1 rounded-md border py-2 text-xs font-medium transition-colors ${
                        genSource === m
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      {m === "upload" ? "Upload" : m === "content" ? "Content" : "Question Bank"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Source-specific inputs */}
              {genSource === "upload" && (
                <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                  <div className="space-y-1">
                    <Label>File Title</Label>
                    <Input
                      placeholder="e.g. Electric Charges Notes"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Select File (PDF / Doc)</Label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        setUploadFile(f);
                        if (f && !uploadTitle) {
                          setUploadTitle(f.name.replace(/\.[^/.]+$/, ""));
                        }
                      }}
                    />
                  </div>
                </div>
              )}

              {genSource === "content" && (
                <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                  <Label>Recent Content Files</Label>
                  {content.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No content found.</p>
                  ) : (
                    <div className="space-y-1">
                      {content.slice(0, 4).map((item) => (
                        <label
                          key={item.id}
                          className="flex cursor-pointer items-center gap-3 rounded-lg border border-transparent p-2 hover:border-border hover:bg-muted/50"
                        >
                          <Checkbox
                            checked={genSelectedIds.has(item.id)}
                            onCheckedChange={() => {
                              setGenSelectedIds((p) => {
                                const n = new Set(p);
                                if (n.has(item.id)) n.delete(item.id);
                                else n.add(item.id);
                                return n;
                              });
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{item.title}</p>
                            <p className="text-[10px] uppercase text-muted-foreground">
                              {item.courseName}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {genSource === "qb" && (
                <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                  <div className="space-y-1">
                    <Label>Subject filter (optional)</Label>
                    <Input
                      placeholder="e.g. Physics"
                      value={genSubject}
                      onChange={(e) => setGenSubject(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Chapter filter (optional)</Label>
                    <Input
                      placeholder="e.g. Optics"
                      value={genChapter}
                      onChange={(e) => setGenChapter(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Topic filters</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="e.g. Thermodynamics"
                        value={genTopicInput}
                        onChange={(e) => setGenTopicInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && genTopicInput.trim()) {
                            setGenTopicFilters((p) => [...p, genTopicInput.trim()]);
                            setGenTopicInput("");
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (genTopicInput.trim()) {
                            setGenTopicFilters((p) => [...p, genTopicInput.trim()]);
                            setGenTopicInput("");
                          }
                        }}
                      >
                        Add
                      </Button>
                    </div>
                    {genTopicFilters.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {genTopicFilters.map((t) => (
                          <Badge key={t} variant="secondary" className="gap-1 text-xs">
                            {t}
                            <button
                              onClick={() => setGenTopicFilters((p) => p.filter((x) => x !== t))}
                              className="hover:text-destructive"
                            >
                              ×
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Shared Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Difficulty</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={genDifficulty}
                    onChange={(e) => setGenDifficulty(e.target.value)}
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Number of Questions</Label>
                  <Input
                    type="number"
                    min={5}
                    max={50}
                    value={genNumQuestions}
                    onChange={(e) => setGenNumQuestions(parseInt(e.target.value) || 10)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>
                  Topic Name <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  placeholder="e.g. Newton's Laws"
                  value={genTopicName}
                  onChange={(e) => setGenTopicName(e.target.value)}
                />
              </div>

              {/* Scheduling Section */}
              <div className="space-y-3 rounded-lg border bg-muted/10 p-3">
                <label className="flex cursor-pointer items-center gap-2 font-medium">
                  <Checkbox
                    checked={isScheduled}
                    onCheckedChange={(checked) => setIsScheduled(!!checked)}
                  />
                  Schedule this DPP
                </label>

                {isScheduled && (
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1.5">
                      <Label>For how many days?</Label>
                      <Input
                        type="number"
                        min={1}
                        max={30}
                        value={schedDays}
                        onChange={(e) => setSchedDays(Math.max(1, parseInt(e.target.value) || 1))}
                      />
                      <p className="text-[10px] text-muted-foreground">Continuously published</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>At what time?</Label>
                      <Input
                        type="time"
                        value={schedTime}
                        onChange={(e) => setSchedTime(e.target.value)}
                      />
                      <p className="text-[10px] text-muted-foreground">Daily at this time</p>
                    </div>
                  </div>
                )}
              </div>

              {usageToday >= dailyLimit && (
                <p className="text-sm text-destructive">
                  Daily limit reached ({dailyLimit}/day). Try again tomorrow.
                </p>
              )}

              <Button className="w-full" onClick={handleGenerate} disabled={!canGenerate}>
                {generating || uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4" /> {isScheduled ? "Schedule DPP" : "Generate DPP"}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* DPP history & Active Schedules */}
        <div className="space-y-6">
          {/* Active Schedules list if any */}
          <div className="space-y-3">
            <h2 className="text-base font-semibold">
              Active Schedules
              {schedules.length > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({schedules.length})
                </span>
              )}
            </h2>
            {loadingSchedules ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : schedules.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  No active schedules.
                </CardContent>
              </Card>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {schedules.map((s) => (
                  <Card key={s.id} className="px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {s.topicFilters?.length
                            ? s.topicFilters.join(", ")
                            : s.contentTitles?.join(", ") || "—"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {s.startDate} → {s.endDate} at {s.timeOfDay}
                        </p>
                      </div>
                      <Badge
                        variant={s.isActive ? "default" : "secondary"}
                        className="shrink-0 text-[10px]"
                      >
                        {s.isActive ? "Active" : "Paused"}
                      </Badge>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => toggleScheduleActive(s.id, s.isActive)}
                      >
                        {s.isActive ? "Pause" : "Resume"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[10px] text-destructive"
                        onClick={() => deleteSchedule(s.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-base font-semibold">Recent DPPs</h2>
            {dpps.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No DPPs generated yet.
                </CardContent>
              </Card>
            ) : (
              <div className="max-h-[600px] space-y-2 pr-1">
                {dpps.map((dpp) => {
                  const batchNames = (dpp.targetBatches || []).map(
                    (id) => batches.find((b) => b.id === id)?.name || id
                  );
                  return (
                    <Card key={dpp.id}>
                      <CardContent className="space-y-2 px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{dpp.title}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {dpp.contentTitles?.join(", ") || "Custom Query"}
                            </p>
                            {batchNames.length > 0 && (
                              <p className="text-[10px] text-primary">
                                Batches: {batchNames.join(", ")}
                              </p>
                            )}
                          </div>
                          <StatusBadge status={dpp.status} />
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <Badge variant="outline" className="px-1 py-0 text-[10px] capitalize">
                            {dpp.difficulty}
                          </Badge>
                          <SourceLabel mode={dpp.sourceMode} />
                          <span>{new Date(dpp.generatedAt).toLocaleString()}</span>
                        </div>
                        {dpp.status === "failed" && dpp.errorMessage && (
                          <p className="text-[10px] text-destructive">{dpp.errorMessage}</p>
                        )}
                        {dpp.status === "ready" && dpp.testId && (
                          <Link
                            to={`/educator/test-series/${dpp.testId}/questions`}
                            className="mt-1 inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" /> View & Edit
                          </Link>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
