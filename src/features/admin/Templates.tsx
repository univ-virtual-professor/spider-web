import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookTemplate,
  CheckCircle2,
  Copy,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";

import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Input } from "@shared/ui/input";
import { Badge } from "@shared/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { MultiSelect } from "@shared/ui/MultiSelect";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@shared/ui/dropdown-menu";
import EmptyState from "@features/admin/components/EmptyState";
import { toast } from "@shared/hooks/use-toast";
import CreateTemplateModal from "@features/admin/components/CreateTemplateModal";

type TemplateStatus = "all" | "published" | "draft";

type AdminTemplate = {
  id: string;
  title: string;
  description?: string;
  subject: string;
  courseId?: string;
  courseName?: string;
  level?: string;
  difficultyLevel?: number;
  durationMinutes: number;
  attemptsAllowed: number;
  questionsCount: number;
  isPublished: boolean;
  sections: Array<{
    name: string;
    questionsCount: number;
    attemptlimit: number;
    selectionRule?: string | null;
  }>;
  markingScheme?: { correct: number; incorrect: number; unanswered: number };
  syllabusCount: number;
  updatedAtTs?: Timestamp | null;
};

function safeNum(value: any, fallback: number) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function fmtDate(ts?: Timestamp | null) {
  if (!ts) return "-";

  try {
    return ts.toDate().toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return "-";
  }
}

export default function Templates() {
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<AdminTemplate[]>([]);

  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [subjectFilters, setSubjectFilters] = useState<string[]>([]);
  const [status, setStatus] = useState<TemplateStatus>("all");
  const [allCourses, setAllCourses] = useState<{ id: string; name: string }[]>([]);
  const [allSubjects, setAllSubjects] = useState<{ id: string; name: string; courseId: string }[]>(
    []
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [templateToEdit, setTemplateToEdit] = useState<any | null>(null);

  const isAdmin = profile?.role === "ADMIN";

  useEffect(() => {
    Promise.all([getDocs(collection(db, "courses")), getDocs(collection(db, "subjects"))]).then(
      ([courseSnap, subjectSnap]) => {
        setAllCourses(
          courseSnap.docs
            .filter((d) => d.data()?.isActive !== false)
            .map((d) => ({ id: d.id, name: d.data().name as string }))
        );
        setAllSubjects(
          subjectSnap.docs.map((d) => ({
            id: d.id,
            name: d.data().name as string,
            courseId: d.data().courseId as string,
          }))
        );
      }
    );
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!isAdmin) {
      setLoading(false);
      setTemplates([]);
      return;
    }

    setLoading(true);
    const qRef = query(collection(db, "templates"), orderBy("updatedAt", "desc"));

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const rows: AdminTemplate[] = snap.docs
          .map((docSnap) => {
            const data = docSnap.data() as any;

            return {
              id: docSnap.id,
              title: String(data?.title || "Untitled Template"),
              description: data?.description ? String(data.description) : "",
              subject: String(data?.subject || ""),
              courseId: data?.courseId || "",
              courseName: data?.courseName || "",
              level: data?.level ? String(data.level) : undefined,
              difficultyLevel:
                typeof data?.difficultyLevel === "number" ? data.difficultyLevel : undefined,
              durationMinutes: safeNum(data?.durationMinutes ?? data?.duration, 60),
              attemptsAllowed: Math.max(1, safeNum(data?.attemptsAllowed, 3)),
              questionsCount: Math.max(
                0,
                safeNum(data?.questionsCount ?? data?.totalQuestions ?? data?.questionCount, 0)
              ),
              isPublished: data?.isPublished !== false,
              sections: Array.isArray(data?.sections) ? data.sections : [],
              markingScheme: data?.markingScheme,
              syllabusCount: Array.isArray(data?.syllabus) ? data.syllabus.length : 0,
              syllabus: data?.syllabus,
              updatedAtTs: (data?.updatedAt as Timestamp) || (data?.createdAt as Timestamp) || null,
            };
          })
          .filter(Boolean) as AdminTemplate[];

        setTemplates(rows);
        setLoading(false);
      },
      () => {
        setTemplates([]);
        setLoading(false);
        toast({
          title: "Failed to load templates",
          description: "Please refresh and try again.",
          variant: "destructive",
        });
      }
    );

    return () => unsub();
  }, [authLoading, isAdmin]);

  const subjectOptions = useMemo(() => {
    const pool =
      courseFilter === "all" ? allSubjects : allSubjects.filter((s) => s.courseId === courseFilter);
    return pool.map((s) => s.name).sort();
  }, [allSubjects, courseFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((item) => {
      const matchesSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        String(item.description || "")
          .toLowerCase()
          .includes(q);

      const matchesCourse = courseFilter === "all" || item.courseId === courseFilter;
      const matchesSubject = subjectFilters.length === 0 || subjectFilters.includes(item.subject);

      const matchesStatus =
        status === "all" || (status === "published" ? item.isPublished : !item.isPublished);

      return matchesSearch && matchesCourse && matchesSubject && matchesStatus;
    });
  }, [templates, search, courseFilter, subjectFilters, status]);

  const stats = useMemo(() => {
    const total = templates.length;
    const published = templates.filter((item) => item.isPublished).length;
    const draft = total - published;
    return { total, published, draft };
  }, [templates]);

  async function toggleTemplateStatus(item: AdminTemplate) {
    try {
      await updateDoc(doc(db, "templates", item.id), {
        isPublished: !item.isPublished,
        updatedAt: serverTimestamp(),
      });
      toast({
        title: !item.isPublished ? "Template published" : "Template moved to draft",
      });
    } catch {
      toast({
        title: "Update failed",
        description: "Could not update template status.",
        variant: "destructive",
      });
    }
  }

  async function duplicateTemplate(item: AdminTemplate) {
    try {
      const srcRef = doc(db, "templates", item.id);
      const srcSnap = await getDoc(srcRef);

      if (!srcSnap.exists()) {
        toast({
          title: "Template not found",
          description: "Original template no longer exists.",
          variant: "destructive",
        });
        return;
      }

      const srcData = srcSnap.data() as any;
      // const newRef = await addDoc(collection(db, "templates"), {
      // 	...srcData,
      // 	title: `${String(srcData?.title || item.title)} (Copy)`,
      // 	isPublished: false,
      // 	createdAt: serverTimestamp(),
      // 	updatedAt: serverTimestamp(),
      // });

      toast({
        title: "Template duplicated",
        description: "Copy created as draft.",
      });
    } catch {
      toast({
        title: "Duplicate failed",
        description: "Could not duplicate template.",
        variant: "destructive",
      });
    }
  }

  async function deleteTemplate(item: AdminTemplate) {
    const ok = window.confirm(`Delete template "${item.title}"?`);
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "templates", item.id));
      toast({ title: "Template deleted" });
    } catch {
      toast({
        title: "Delete failed",
        description: "Could not delete template.",
        variant: "destructive",
      });
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Templates</h1>
          <p className="text-sm text-muted-foreground">
            Manage reusable test templates for educators
          </p>
        </div>
        <Card className="card-soft border-0">
          <CardContent className="flex items-center justify-center p-8 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading templates...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Templates</h1>
          <p className="text-sm text-muted-foreground">Admin access required</p>
        </div>
        <EmptyState
          icon={BookTemplate}
          title="Admin only"
          description="Please login with an Admin account to manage templates."
          actionLabel="Go to Login"
          onAction={() => (window.location.href = "/login?role=admin")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-2xl font-bold">Templates</h1>
          <p className="text-sm text-muted-foreground">
            Create and publish test templates available for educators
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/admin/dpp-template")}>
            DPP Template
          </Button>
          <Button
            className="gradient-bg text-white"
            onClick={() => {
              setTemplateToEdit(null);
              setModalOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Create Template
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="card-soft border-0">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Templates</p>
            <p className="text-xl font-semibold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="card-soft border-0">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Published</p>
            <p className="text-xl font-semibold text-green-600">{stats.published}</p>
          </CardContent>
        </Card>
        <Card className="card-soft border-0">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Draft</p>
            <p className="text-xl font-semibold text-amber-600">{stats.draft}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="card-soft border-0">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates..."
                className="pl-9"
              />
            </div>

            <Select
              value={courseFilter}
              onValueChange={(v) => {
                setCourseFilter(v);
                setSubjectFilters([]);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="All Courses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Courses</SelectItem>
                {allCourses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <MultiSelect
              options={subjectOptions}
              selected={subjectFilters}
              onChange={setSubjectFilters}
              placeholder="All Subjects"
              disabled={subjectOptions.length === 0}
            />

            <Select value={status} onValueChange={(v) => setStatus(v as TemplateStatus)}>
              <SelectTrigger>
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={BookTemplate}
          title="No templates found"
          description="Create your first template or adjust filters."
          actionLabel="Create Template"
          onAction={() => {
            setTemplateToEdit(null);
            setModalOpen(true);
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <Card key={item.id} className="card-soft">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-start justify-between gap-2 text-base">
                  <span className="line-clamp-2">{item.title}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setTemplateToEdit(item);
                          setModalOpen(true);
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" /> Edit Template
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => duplicateTemplate(item)}>
                        <Copy className="mr-2 h-4 w-4" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => toggleTemplateStatus(item)}>
                        {item.isPublished ? (
                          <>
                            <XCircle className="mr-2 h-4 w-4" /> Move to Draft
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="mr-2 h-4 w-4" /> Publish
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => deleteTemplate(item)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                {/* <p className="text-sm text-muted-foreground line-clamp-2 min-h-[40px]">{item.description || "No description"}</p> */}

                <div className="flex flex-wrap gap-2">
                  {item.courseName && (
                    <Badge className="rounded-full border-primary/20 bg-primary/10 text-primary">
                      {item.courseName}
                    </Badge>
                  )}
                  {item.subject && (
                    <Badge variant="secondary" className="rounded-full">
                      {item.subject}
                    </Badge>
                  )}
                  {item.level ? (
                    <Badge variant="outline" className="rounded-full">
                      {item.level}
                    </Badge>
                  ) : null}
                  {item.isPublished ? (
                    <Badge className="rounded-full bg-green-100 text-green-700">Published</Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="rounded-full border-amber-300 text-amber-700"
                    >
                      Draft
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 border-b border-border/40 pb-2 text-xs text-muted-foreground">
                  <div>
                    <p>Duration</p>
                    <p className="font-medium text-foreground">{item.durationMinutes}m</p>
                  </div>
                  <div>
                    <p>Attempts</p>
                    <p className="font-medium text-foreground">{item.attemptsAllowed}</p>
                  </div>
                  <div>
                    <p>Questions</p>
                    <p className="font-medium text-foreground">{item.questionsCount}</p>
                  </div>
                </div>

                {/* Template Details: Sections & Marking */}
                <div className="space-y-2 text-xs">
                  {item.sections && item.sections.length > 0 && (
                    <div>
                      <p className="mb-1 font-medium text-muted-foreground">
                        Sections ({item.sections.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {item.sections.slice(0, 3).map((sec, idx) => (
                          <span key={idx} className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px]">
                            {sec.name} ({safeNum(sec.questionsCount, 0)}
                            {sec.attemptlimit !== undefined
                              ? `, To attempt ${sec.selectionRule === "EXACT" ? "=" : "≤"}${sec.attemptlimit}`
                              : ""}
                            )
                          </span>
                        ))}
                        {item.sections.length > 3 && (
                          <span className="pl-1 text-[10px] text-muted-foreground">
                            +{item.sections.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {(item.markingScheme || item.syllabusCount > 0) && (
                    <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
                      {item.markingScheme ? (
                        <span className="flex gap-1.5">
                          <span className="font-medium text-green-600">
                            +{safeNum(item.markingScheme.correct, 0)}
                          </span>
                          <span className="text-red-500">
                            {safeNum(item.markingScheme.incorrect, 0)}
                          </span>
                        </span>
                      ) : (
                        <span>No marking scheme</span>
                      )}

                      {item.syllabusCount > 0 && <span>{item.syllabusCount} topics</span>}
                    </div>
                  )}
                </div>

                <p className="pt-2 text-[10px] text-muted-foreground">
                  Updated: {fmtDate(item.updatedAtTs)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateTemplateModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        templateToEdit={templateToEdit}
      />
    </div>
  );
}
