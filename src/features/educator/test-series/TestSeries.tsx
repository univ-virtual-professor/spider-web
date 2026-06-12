import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Search,
  Plus,
  Edit,
  Trash2,
  FileText,
  Clock,
  BookOpen,
  Loader2,
  Folder,
  MoreVertical,
  Move,
  Award,
  Building2,
  ArrowLeft,
  FileUp,
  ChevronDown,
  ArrowUpDown,
  Pencil,
  LayoutList,
  LayoutGrid,
  Download,
} from "lucide-react";

import { Input } from "@shared/ui/input";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Dialog } from "@shared/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@shared/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@shared/lib/utils";

import EmptyState from "@features/educator/components/EmptyState";

import { uploadToImageKit } from "@shared/lib/imagekitUpload";
import { buildAutoFillSelection } from "@shared/lib/autoFillEngine";
import { normalizeQuestionType } from "@shared/lib/questionTypes";

// Component
import CreateCustomTest from "./CreateCustomTest";
import CreateEducatorTemplate from "./CreateEducatorTemplate";
import ImportAdminTestDialog from "./ImportAdminTestDialog";
import NewFolderButton from "./NewFolder";
import AssignAndScheduleDialog from "../components/AssignAndScheduleDialog";
import { useAccessibleCourses } from "@shared/hooks/useAccessibleCourses";

// Firebase
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDocs,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
  orderBy,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import MoveTest from "./MoveTest";

const MONKEY_KING = import.meta.env.VITE_MONKEY_KING_API_URL || "";

const ATTEMPTS_OPTIONS = [
  { value: "1", label: "1 Attempt" },
  { value: "2", label: "2 Attempts" },
];

const SCROLL_ITEM_H = 32;
const SCROLL_VISIBLE = 4;

function ScrollPicker({
  options,
  value,
  onChange,
  disabled,
  onSelect,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  onSelect?: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Item sits at slot 1 (second from top) when selected.
  // scrollTop = selectedIndex * SCROLL_ITEM_H
  const scrollToIndex = (idx: number, animated = true) => {
    ref.current?.scrollTo({
      top: idx * SCROLL_ITEM_H,
      behavior: animated ? "smooth" : ("instant" as ScrollBehavior),
    });
  };

  useEffect(() => {
    const idx = options.findIndex((o) => o.value === value);
    if (idx >= 0) scrollToIndex(idx, false);
  }, [value, options]);

  const handleScroll = () => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!ref.current) return;
      const idx = Math.round(ref.current.scrollTop / SCROLL_ITEM_H);
      const clamped = Math.max(0, Math.min(idx, options.length - 1));
      scrollToIndex(clamped);
      const opt = options[clamped];
      if (opt && opt.value !== value) onChange(opt.value);
    }, 120);
  };

  return (
    <div className="relative w-36" style={{ height: SCROLL_ITEM_H * SCROLL_VISIBLE }}>
      {/* top/bottom fade */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-popover to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8 bg-gradient-to-t from-popover to-transparent" />
      {/* selection highlight at slot 1 */}
      <div
        className="pointer-events-none absolute inset-x-2 z-0 rounded-lg bg-primary/10 ring-1 ring-primary/20"
        style={{ top: SCROLL_ITEM_H, height: SCROLL_ITEM_H }}
      />
      <div
        ref={ref}
        onScroll={handleScroll}
        className="h-full overflow-y-scroll [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
      >
        {/* webkit scrollbar hidden via inline style trick */}
        {/* 1 item of top padding → item 0 centres at slot 1 when scrollTop=0 */}
        <div style={{ height: SCROLL_ITEM_H }} aria-hidden />
        {options.map((opt, i) => (
          <div
            key={opt.value}
            style={{ height: SCROLL_ITEM_H }}
            onClick={() => {
              if (disabled) return;
              onChange(opt.value);
              scrollToIndex(i);
              onSelect?.(opt.value);
            }}
            className={cn(
              "relative z-20 flex cursor-pointer select-none items-center justify-center text-sm font-semibold transition-all duration-150",
              opt.value === value
                ? "text-primary"
                : "text-muted-foreground opacity-50 hover:opacity-75"
            )}
          >
            {opt.label}
          </div>
        ))}
        {/* 2 items of bottom padding → last item can reach slot 1 */}
        <div style={{ height: SCROLL_ITEM_H * 2 }} aria-hidden />
      </div>
    </div>
  );
}

type Difficulty = "easy" | "medium" | "hard";

type TestQuestion = {
  id: string;
  questionOrder?: number;

  // Stored schema (admin-compatible)
  question: string; // can be plain text OR HTML
  options: string[]; // can be plain text OR HTML strings
  correctOption: number; // index
  explanation?: string; // plain/HTML

  difficulty: Difficulty;
  subject?: string;
  topic?: string;

  marks?: number; // positive marks
  negativeMarks?: number;

  isActive?: boolean;

  // AI import metadata
  source?: "ai_import" | "ai_import_partial" | string;
  importStatus?: "ready" | "partial";
  reviewRequired?: boolean;
  importIssues?: string[];
  importSourceIndex?: number;
  rawImportBlock?: string;
  questionImageUrl?: string;

  createdAt?: any;
  updatedAt?: any;
};

function pruneUndefined<T extends Record<string, any>>(obj: T): T {
  Object.keys(obj).forEach((k) => {
    const v = (obj as any)[k];
    if (v === undefined) {
      delete (obj as any)[k];
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      pruneUndefined(v);
    }
  });
  return obj;
}

function toEndOfDayTs(yyyyMmDd: string) {
  const [y, m, d] = yyyyMmDd.split("-").map((v) => parseInt(v, 10));
  if (!y || !m || !d) return null;
  return Timestamp.fromDate(new Date(y, m - 1, d, 23, 59, 59, 999));
}

async function pickImageFile(): Promise<File | null> {
  return await new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const f = input.files?.[0] || null;
      resolve(f);
    };
    input.click();
  });
}

async function appendImageToField(current: string, folder = "/test-questions") {
  const f = await pickImageFile();
  if (!f) return { next: current, url: null };

  try {
    // Use "website" scope so educators can upload (question-bank scope is admin-only)
    const { url } = await uploadToImageKit(f, f.name, folder, "website");
    const imgTag = `\n<img src="${url}" alt="" />\n`;
    return { next: (current || "") + imgTag, url };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Failed to upload image";
    console.error("[Image Upload Error]", errorMsg);
    throw error; // Re-throw so caller can handle
  }
}

export default function TestSeries() {
  const navigate = useNavigate();
  const isApp =
    new URLSearchParams(window.location.search).get("_app") === "1" ||
    window.sessionStorage.getItem("__PK_APP_WEBVIEW__") === "1";
  const { firebaseUser: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<"overall" | "dpp" | "test">("overall");

  // Data
  const [myTests, setMyTests] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  /** testId → true if source template has been updated since test creation */
  const [driftTests, setDriftTests] = useState<Set<string>>(new Set());

  // UI
  const [search, setSearch] = useState("");
  const [importingId, setImportingId] = useState<string | null>(null);
  const [globalAttemptsAllowed, setGlobalAttemptsAllowed] = useState(1);
  const [savingGlobalAttempts, setSavingGlobalAttempts] = useState(false);

  // Create / edit custom test dialog fields
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingTest, setEditingTest] = useState<any | null>(null);

  // Folder UI state
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderCreating, setFolderCreating] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "az">("newest");
  const [flatView, setFlatView] = useState(false);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [moveTestOpen, setMoveTestOpen] = useState(false);
  const [testToMove, setTestToMove] = useState<any>(null);

  // Assign & Give Access dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignDialogTest, setAssignDialogTest] = useState<any>(null);

  const [allBatches, setAllBatches] = useState<
    { id: string; name: string; courseId: string; branchId: string; label: string }[]
  >([]);

  // Batch filter (library tab)
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [branches, setBranches] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [programFilter, setProgramFilter] = useState<string>("all");

  // Template state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("none");
  const [educatorTemplates, setEducatorTemplates] = useState<any[]>([]);
  const [createTemplateOpen, setCreateTemplateOpen] = useState(false);

  // Import admin test dialog
  const [importAdminOpen, setImportAdminOpen] = useState(false);

  // Auto-import state
  const [autoFillTestId, setAutoFillTestId] = useState<string | null>(null);

  // Course/subject filters
  const { courses: accessibleCourses, subjects: accessibleSubjects } = useAccessibleCourses(
    currentUser?.uid ?? ""
  );
  const [courseFilter, setCourseFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");

  // Data subscriptions — re-run whenever the authenticated user changes
  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      setMyTests([]);
      setFolders([]);
      setEducatorTemplates([]);
      return;
    }

    const uid = currentUser.uid;

    // Load all branches, courses/programs, and batches for cascading filters and batch-assignment dialog
    getDocs(collection(db, "educators", uid, "branches")).then(async (branchSnap) => {
      const branchList: { id: string; name: string }[] = [];
      const programList: { id: string; name: string; branchId: string }[] = [];
      const batchList: any[] = [];

      for (const branchDoc of branchSnap.docs) {
        const branchData = branchDoc.data();
        branchList.push({ id: branchDoc.id, name: branchData.name || "Unnamed Branch" });

        const courseSnap = await getDocs(
          collection(db, "educators", uid, "branches", branchDoc.id, "courses")
        );
        for (const courseDoc of courseSnap.docs) {
          const courseData = courseDoc.data();
          programList.push({
            id: courseDoc.id,
            name: courseData.name || "Unnamed Program",
            branchId: branchDoc.id,
          });

          const batchSnap = await getDocs(
            collection(
              db,
              "educators",
              uid,
              "branches",
              branchDoc.id,
              "courses",
              courseDoc.id,
              "batches"
            )
          );
          batchSnap.docs.forEach((b) => {
            const batchData = b.data();
            batchList.push({
              id: b.id,
              name: batchData.name || "Unnamed Batch",
              courseId: courseDoc.id,
              branchId: branchDoc.id,
              label: `${branchData.name || "Unnamed Branch"} / ${courseData.name || "Unnamed Program"} / ${batchData.name || "Unnamed Batch"}`,
            });
          });
        }
      }
      setBranches(branchList);
      setPrograms(programList);
      setAllBatches(batchList);
    });

    // Load educator preferences
    const unsubEdu = onSnapshot(doc(db, "educators", uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setGlobalAttemptsAllowed(data?.testDefaults?.attemptsAllowed ?? 1);
      }
    });

    // FOLDERS: educators/{uid}/folders
    const foldersQ = query(collection(db, "educators", uid, "folders"));
    const unsubFolders = onSnapshot(foldersQ, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setFolders(rows);
    });

    const templatesQ = query(collection(db, "educators", uid, "templates"));
    const unsubTemplates = onSnapshot(
      templatesQ,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEducatorTemplates(rows);
      },
      () => {
        toast.error("Failed to load your templates.");
      }
    );

    // MY tests: educators/{uid}/my_tests
    const myTestsQ = query(
      collection(db, "educators", uid, "my_tests"),
      orderBy("createdAt", "desc")
    );
    const unsubMy = onSnapshot(
      myTestsQ,
      async (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMyTests(rows);

        // Async drift check — non-blocking; errors silently ignored
        const drifted = new Set<string>();
        await Promise.all(
          rows
            .filter((t: any) => t.sourceTemplateId && t.sourceTemplateVersion != null)
            .map(async (t: any) => {
              try {
                const tmplSnap = await getDoc(doc(db, "templates", t.sourceTemplateId));
                if (!tmplSnap.exists()) return;
                const currentVersion = Number(tmplSnap.data()?.version ?? 0);
                const testVersion = Number(t.sourceTemplateVersion ?? 0);
                if (currentVersion > testVersion) drifted.add(t.id);
              } catch {
                // Non-fatal; drift badge simply won't show
              }
            })
        );
        setDriftTests(drifted);
        setLoading(false);
      },
      () => {
        toast.error("Failed to load your tests.");
        setLoading(false);
      }
    );

    return () => {
      unsubEdu();
      unsubFolders();
      unsubTemplates();
      unsubMy();
    };
  }, [currentUser?.uid]);

  const handleCreateFolder = async () => {
    if (!currentUser) {
      toast.error("Please login again and retry.");
      return;
    }

    const name = newFolderName.trim();
    if (!name) {
      toast.error("Folder name is required.");
      return;
    }

    const exists = folders.some(
      (f) =>
        String(f?.name || "")
          .trim()
          .toLowerCase() === name.toLowerCase()
    );
    if (exists) {
      toast.error("A folder with this name already exists.");
      return;
    }

    setFolderCreating(true);
    try {
      const folderRef = await addDoc(collection(db, "educators", currentUser.uid, "folders"), {
        name,
        order: folders.length,
        createdAt: serverTimestamp(),
      });
      setExpandedFolders((prev) => ({ ...prev, [folderRef.id]: true }));
      toast.success("Folder created");
      setNewFolderName("");
      setCreateFolderOpen(false);
    } catch (e) {
      console.error(e);
      toast.error("Failed to create folder");
    } finally {
      setFolderCreating(false);
    }
  };

  const handleMoveTest = async (testId: string, folderId: string | null) => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, "educators", currentUser.uid, "my_tests", testId), {
        folderId: folderId,
        updatedAt: serverTimestamp(),
      });
      toast.success("Moved successfully");
      setMoveTestOpen(false);
      setTestToMove(null);
    } catch (e) {
      console.error(e);
      toast.error("Failed to move test");
    }
  };

  const handleAutoFill = async (test: any) => {
    if (!currentUser) return;
    const rawSections: any[] = test.sections || [];
    // questionsTarget is the immutable user-set limit; questionsCount gets overwritten with actual count.
    // Fall back to questionsCount only if questionsTarget is absent (old tests).
    const noSectionsTarget = test.questionsTarget ?? test.questionsCount;
    console.log("[autoFill] test fields:", {
      id: test.id,
      questionsTarget: test.questionsTarget,
      questionsCount: test.questionsCount,
      noSectionsTarget,
      rawSectionsCount: rawSections.length,
      markingScheme: test.markingScheme,
    });
    const sections: any[] = rawSections.length
      ? rawSections
      : noSectionsTarget
        ? [
            {
              id: "main",
              name: test.subject || "General",
              questionsCount: noSectionsTarget,
              format: test.questionFormat || "",
              chapters: Array.isArray(test.chapters)
                ? test.chapters
                : test.chapter
                  ? [test.chapter]
                  : [],
              topics: Array.isArray(test.topics) ? test.topics : [],
              tags: Array.isArray(test.tags) ? test.tags : [],
              markingScheme: test.markingScheme || null,
            },
          ]
        : [];
    if (!sections.length) {
      toast.error("No sections configured");
      return;
    }
    const hasConfig = sections.some((s: any) => s.questionsCount > 0);
    if (!hasConfig) {
      toast.error("Set question counts on sections first");
      return;
    }

    setAutoFillTestId(test.id);
    try {
      // Educator's allowed subjects
      const eduSnap = await getDoc(doc(db, "educators", currentUser.uid));
      const allowedSubjectIds: string[] = eduSnap.data()?.allowedSubjectIds ?? [];

      // Load own question bank
      const ownSnap = await getDocs(collection(db, "educators", currentUser.uid, "question_bank"));
      const ownQs = ownSnap.docs.map((d) => ({ id: d.id, _source: "educator", ...d.data() }));

      // Load admin questions (filter by allowed subjects)
      const adminSnap = await getDocs(collection(db, "question_bank"));
      const adminQs = adminSnap.docs
        .map((d) => ({ id: d.id, _source: "admin", ...d.data() }))
        .filter(
          (q: any) => allowedSubjectIds.length === 0 || allowedSubjectIds.includes(q.subjectId)
        );

      const allQs: any[] = [...ownQs, ...adminQs];

      // Load question group manifests for group-aware selection
      const groupsSnap = await getDocs(collection(db, "question_groups"));
      const groupManifests = new Map(
        groupsSnap.docs.map((d) => [
          d.id,
          {
            groupId: d.id,
            type: d.data().type as "comprehension" | "case_study",
            questionCount: Number(d.data().questionCount || 0),
          },
        ])
      );

      // Questions already in this test
      const existingSnap = await getDocs(
        collection(db, "educators", currentUser.uid, "my_tests", test.id, "questions")
      );
      const usedIds = new Set(
        existingSnap.docs.map((d) => {
          const data = d.data() as any;
          return String(data.bankQuestionId || d.id);
        })
      );
      let order = existingSnap.docs.length;
      console.log("[autoFill] existing questions in subcollection:", order);

      // Count existing questions per section so we only fill the actual gap.
      const existingBySectionId: Record<string, number> = {};
      existingSnap.docs.forEach((d) => {
        const sId = String((d.data() as any).sectionId || "main");
        existingBySectionId[sId] = (existingBySectionId[sId] || 0) + 1;
      });
      console.log("[autoFill] existingBySectionId:", existingBySectionId);

      // Build section constraints from template sections
      const sectionConstraints = sections.map((s: any) => {
        const target = Number(s.questionsCount) || 0;
        const existingInSection = existingBySectionId[s.id || s.name] || 0;
        const remaining = Math.max(0, target - existingInSection);
        return {
          id: s.id || s.name,
          name: s.name,
          questionsCount: remaining,
          subject: s.subject,
          chapters: Array.isArray(s.chapters)
            ? s.chapters
            : Array.isArray(s.chapter)
              ? s.chapter
              : s.chapter
                ? [s.chapter]
                : undefined,
          topics: s.topics,
          tags: s.tags,
          format: s.format,
          difficultyLevel: s.difficultyLevel,
          difficultyTolerance: s.difficultyTolerance ?? 0.25,
          groupTypes: s.groupTypes,
          markingScheme: s.markingScheme || null,
        };
      });

      console.log(
        "[autoFill] sectionConstraints:",
        sectionConstraints.map((s) => ({
          id: s.id,
          name: s.name,
          questionsCount: s.questionsCount,
          markingScheme: s.markingScheme,
        }))
      );

      if (sectionConstraints.every((s) => s.questionsCount === 0)) {
        console.log("[autoFill] all sections at limit — aborting");
        toast.info("Test is already at its question limit.");
        return;
      }

      // Run group-aware selection
      const { chosen, coverage } = buildAutoFillSelection(
        allQs,
        groupManifests,
        sectionConstraints,
        {
          excludeIds: usedIds,
        }
      );

      if (!chosen.length && coverage.every((c) => c.shortfall === c.needed)) {
        // QB found nothing at all — skip batch write, go straight to AI gap-fill
      } else if (chosen.length > 0) {
        // Batch-write chosen questions to the test
        const CHUNK = 490;
        let batch = writeBatch(db);
        let ops = 0;

        for (const q of chosen) {
          const qRef = doc(
            collection(db, "educators", currentUser.uid, "my_tests", test.id, "questions")
          );
          const { id, _source, _sectionId, ...rest } = q as any;
          const qData: any = {
            ...rest,
            bankQuestionId: id,
            questionOrder: order++,
            addedAt: serverTimestamp(),
            questionType: normalizeQuestionType(rest.questionType || rest.format || "MCQ_SINGLE"),
            ...(_sectionId && { sectionId: _sectionId }),
          };
          batch.set(qRef, qData);
          usedIds.add(id);
          ops++;

          if (ops >= CHUNK) {
            await batch.commit();
            batch = writeBatch(db);
            ops = 0;
          }
        }

        if (ops > 0) {
          batch.update(doc(db, "educators", currentUser.uid, "my_tests", test.id), {
            questionsCount: order,
            updatedAt: serverTimestamp(),
          });
          await batch.commit();
        }
      }

      // AI gap-fill for shortfall sections
      const shortfallSections = coverage.filter((c) => c.shortfall > 0);
      console.log("[autoFill] QB coverage:", coverage);
      console.log("[autoFill] shortfallSections:", shortfallSections);
      let aiGenerated = 0;
      if (shortfallSections.length > 0 && MONKEY_KING) {
        const token = await currentUser.getIdToken();
        for (const c of shortfallSections) {
          const constraint = sectionConstraints.find((sc) => sc.id === c.sectionId);
          const dl = constraint?.difficultyLevel ?? 0.5;
          const diffStr = dl <= 0.33 ? "easy" : dl >= 0.67 ? "hard" : "medium";
          const gapFillBody = {
            test_id: test.id,
            section_id: c.sectionId,
            needed: c.shortfall,
            difficulty: diffStr,
            topic_filters: constraint?.topics ?? [],
            chapter_filter: constraint?.chapter ?? "",
            subject: constraint?.subject ?? test.subject ?? "",
            question_type: constraint?.format || test.questionFormat || "MCQ_SINGLE",
            tags: constraint?.tags ?? [],
            section_name: c.sectionName,
            current_question_count: order,
            positive_marks: Number((constraint?.markingScheme || test.markingScheme)?.correct ?? 4),
            negative_marks: Number(
              (constraint?.markingScheme || test.markingScheme)?.incorrect ?? -1
            ),
            course_id: test.courseId ?? "",
            course_name: test.courseName ?? "",
          };
          console.log("[autoFill] gap-fill request body:", gapFillBody);
          try {
            const res = await fetch(`${MONKEY_KING}/api/test/gap-fill`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(gapFillBody),
            });
            const result = await res.json();
            console.log("[autoFill] gap-fill response:", {
              status: res.status,
              ok: res.ok,
              result,
            });
            if (res.ok) {
              aiGenerated += result.generated ?? 0;
              order += result.generated ?? 0;
            }
          } catch (gapErr) {
            console.error("[autoFill] gap-fill fetch error for section", c.sectionId, gapErr);
          }
        }
        if (aiGenerated > 0) {
          toast.info(
            `AI filled ${aiGenerated} gap question${aiGenerated !== 1 ? "s" : ""} — marked for review`
          );
        }
      }

      const qbFilled = chosen.length;
      if (qbFilled === 0 && aiGenerated === 0) {
        toast.warning("No matching questions found. Check section subject/format/topic filters.");
        return;
      }
      if (qbFilled > 0) {
        toast.success(
          `Auto-filled ${qbFilled} question${qbFilled !== 1 ? "s" : ""} from question bank`
        );
      }
    } catch (e) {
      console.error(e);
      toast.error("Auto-fill failed");
    } finally {
      setAutoFillTestId(null);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!currentUser) return;
    if (
      !confirm(
        "Delete this folder? Tests inside will be moved to their subject folders or Uncategorized."
      )
    )
      return;
    try {
      // 1. Reset folderId for tests in this folder
      const batch = writeBatch(db);
      const testsInFolder = myTests.filter((t) => t.folderId === folderId);
      testsInFolder.forEach((t) => {
        batch.update(doc(db, "educators", currentUser.uid, "my_tests", t.id), { folderId: null });
      });

      // 2. Delete folder doc
      batch.delete(doc(db, "educators", currentUser.uid, "folders", folderId));

      await batch.commit();
      toast.success("Folder deleted");
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete folder");
    }
  };

  const toggleFolder = (key: string) => {
    setExpandedFolders((prev) => ({ ...prev, [key]: prev[key] !== false ? false : true }));
  };

  const handleRenameFolder = async () => {
    if (!currentUser || !renamingFolderId) return;
    const name = renameFolderName.trim();
    setRenamingFolderId(null);
    if (!name) return;
    try {
      await updateDoc(doc(db, "educators", currentUser.uid, "folders", renamingFolderId), { name });
      toast.success("Folder renamed");
    } catch {
      toast.error("Failed to rename folder");
    }
  };

  const handleReorderFolder = async (folderId: string, direction: -1 | 1) => {
    if (!currentUser) return;
    const sorted = [...folders].sort((a: any, b: any) => {
      const ao = a.order ?? Infinity;
      const bo = b.order ?? Infinity;
      if (ao !== bo) return ao - bo;
      return (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0);
    });
    const idx = sorted.findIndex((f: any) => f.id === folderId);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "educators", currentUser.uid, "folders", (sorted[idx] as any).id), {
        order: swapIdx,
      });
      batch.update(doc(db, "educators", currentUser.uid, "folders", (sorted[swapIdx] as any).id), {
        order: idx,
      });
      await batch.commit();
    } catch {
      toast.error("Failed to reorder folder");
    }
  };

  const normalizeSubjectName = (sub: string) => {
    const s = sub.trim().toLowerCase();

    // Exact mapping for requested subjects
    if (s === "bst" || s === "business studies" || s === "business study")
      return "Business Studies";
    if (s === "phy" || s === "physics") return "Physics";
    if (s === "chem" || s === "chemistry") return "Chemistry";
    if (s === "math" || s === "maths" || s === "mathematics") return "Maths";
    if (s === "eng" || s === "english") return "English";
    if (s === "gt" || s === "general test") return "General Test";
    if (s === "acc" || s === "accountancy" || s === "accounts") return "Accountancy";
    if (s === "eco" || s === "economics") return "Economics";
    if (s === "geo" || s === "geography") return "Geography";
    if (s === "pol sc" || s === "political science" || s === "polscience" || s === "polity")
      return "Political Science";
    if (s === "hist" || s === "history") return "History";

    // Default: Capitalize first letter of each word
    return sub
      .trim()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  const SUGGESTED_SUBJECTS = [
    "Physics",
    "Chemistry",
    "Maths",
    "English",
    "General Test",
    "Accountancy",
    "Business Studies",
    "Economics",
    "Geography",
    "Political Science",
    "History",
  ];

  const batchMap = useMemo(() => {
    const map = new Map<string, { branchId: string; courseId: string; name: string }>();
    allBatches.forEach((b) => {
      map.set(b.id, { branchId: b.branchId, courseId: b.courseId, name: b.name });
    });
    return map;
  }, [allBatches]);

  const filteredProgramOptions = useMemo(() => {
    if (branchFilter === "all") return programs;
    return programs.filter((p) => p.branchId === branchFilter);
  }, [programs, branchFilter]);

  const filteredBatchOptions = useMemo(() => {
    if (programFilter !== "all") {
      return allBatches.filter((b) => b.courseId === programFilter);
    }
    if (branchFilter !== "all") {
      return allBatches.filter((b) => b.branchId === branchFilter);
    }
    return allBatches;
  }, [allBatches, branchFilter, programFilter]);

  const handleBranchChange = (v: string) => {
    setBranchFilter(v);
    setProgramFilter("all");
    setBatchFilter("all");
  };

  const handleProgramChange = (v: string) => {
    setProgramFilter(v);
    setBatchFilter("all");
  };

  const filteredTests = useMemo(() => {
    const q = search.trim().toLowerCase();
    const allItems = [...myTests];
    const filtered = allItems.filter((t) => {
      const isDpp =
        t.type === "from_dpp" ||
        t.type === "dpp" ||
        String(t.title || "")
          .toLowerCase()
          .includes("dpp");

      if (activeTab === "dpp" && !isDpp) return false;
      if (activeTab === "test" && isDpp) return false;

      if (q) {
        const hay =
          `${t.title || ""} ${t.description || ""} ${t.subject || ""} ${t.level || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      // Org-level cascading filters
      const testBatches: string[] = t.targetBatches || [];
      if (batchFilter !== "all") {
        if (!testBatches.includes(batchFilter)) return false;
      } else if (programFilter !== "all") {
        const matchesProgram = testBatches.some((bId) => {
          const bMeta = batchMap.get(bId);
          return bMeta && bMeta.courseId === programFilter;
        });
        if (!matchesProgram) return false;
      } else if (branchFilter !== "all") {
        const matchesBranch = testBatches.some((bId) => {
          const bMeta = batchMap.get(bId);
          return bMeta && bMeta.branchId === branchFilter;
        });
        if (!matchesBranch) return false;
      }

      if (courseFilter !== "all" && t.courseId !== courseFilter) return false;
      if (subjectFilter !== "all" && t.subject !== subjectFilter) return false;
      return true;
    });

    return filtered;
  }, [
    myTests,
    search,
    courseFilter,
    subjectFilter,
    branchFilter,
    programFilter,
    batchFilter,
    activeTab,
    batchMap,
  ]);

  const sortedTests = useMemo(() => {
    const arr = [...filteredTests];
    if (sortBy === "az") {
      arr.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    } else if (sortBy === "oldest") {
      arr.sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
    } else {
      arr.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    }
    return arr;
  }, [filteredTests, sortBy]);

  const groupedTests = useMemo(() => {
    const folderMap = new Map<string, { folder: any; tests: any[] }>();
    const subjectMap = new Map<string, any[]>();

    for (const test of sortedTests) {
      if (test.folderId) {
        const folder = folders.find((f: any) => f.id === test.folderId);
        if (folder) {
          if (!folderMap.has(test.folderId)) folderMap.set(test.folderId, { folder, tests: [] });
          folderMap.get(test.folderId)!.tests.push(test);
          continue;
        }
      }
      const isDppTest = test.type === "from_dpp" || test.type === "dpp";
      const subject = isDppTest ? "DPP" : test.subject || "Other";
      if (!subjectMap.has(subject)) subjectMap.set(subject, []);
      subjectMap.get(subject)!.push(test);
    }

    const folderGroups = [...folderMap.values()]
      .sort((a, b) => {
        const ao = a.folder.order ?? Infinity;
        const bo = b.folder.order ?? Infinity;
        if (ao !== bo) return ao - bo;
        return (a.folder.createdAt?.toMillis?.() ?? 0) - (b.folder.createdAt?.toMillis?.() ?? 0);
      })
      .map(({ folder, tests }) => ({
        type: "folder" as const,
        key: folder.id,
        label: folder.name,
        tests,
      }));

    const subjectGroups = [...subjectMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([subject, tests]) => ({
        type: "subject" as const,
        key: "subject__" + subject,
        label: subject,
        tests,
      }));

    return [...folderGroups, ...subjectGroups];
  }, [sortedTests, folders]);

  // Subjects available for current course filter (for filter dropdowns)
  const filterSubjectOptions = useMemo(() => {
    const subjectsForCourse =
      courseFilter === "all"
        ? accessibleSubjects
        : accessibleSubjects.filter((s) => s.courseId === courseFilter);
    return subjectsForCourse;
  }, [accessibleSubjects, courseFilter]);

  const templateOptions = useMemo(
    () => [
      ...educatorTemplates.map((template: any) => ({
        id: `edu:${template.id}`,
        label: String(template?.templateName || template?.title || "Custom template"),
        group: "educator" as const,
      })),
    ],
    [educatorTemplates]
  );

  const folderState = {
    createFolderOpen,
    setCreateFolderOpen,
    newFolderName,
    setNewFolderName,
    folderCreating,
    handleCreateFolder,
  };

  const handleSaveGlobalAttempts = async (val: number) => {
    if (!currentUser) return;
    setSavingGlobalAttempts(true);
    try {
      // 1. Update educator profile
      await updateDoc(doc(db, "educators", currentUser.uid), {
        "testDefaults.attemptsAllowed": val,
        updatedAt: serverTimestamp(),
      });

      // 2. Bulk update all existing tests to this value
      const testsSnap = await getDocs(collection(db, "educators", currentUser.uid, "my_tests"));
      if (!testsSnap.empty) {
        const CHUNK_SIZE = 450;
        const docs = testsSnap.docs;

        for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
          const batch = writeBatch(db);
          const chunk = docs.slice(i, i + CHUNK_SIZE);
          chunk.forEach((d) => {
            batch.update(d.ref, {
              attemptsAllowed: val,
              updatedAt: serverTimestamp(),
            });
          });
          await batch.commit();
        }
      }

      toast.success(`Global default attempts set to ${val} for all tests`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to save global setting");
    } finally {
      setSavingGlobalAttempts(false);
    }
  };

  const handleUpdateTestAttempts = async (testId: string, val: number) => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, "educators", currentUser.uid, "my_tests", testId), {
        attemptsAllowed: val,
        updatedAt: serverTimestamp(),
      });
      toast.success(`Attempts for this test set to ${val}`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to update test attempts");
    }
  };

  // Import admin test as a shared reference (no question copy)

  // Create educator custom test (NO question bank import allowed, manual questions only)
  const handleCreateCustom = async (values: any) => {
    if (!currentUser) return;

    // ── EDIT path ──────────────────────────────────────────────────────────────
    if (editingTest) {
      const update: any = {
        title: String(values.title || ""),
        description: String(values.description || ""),
        courseId: values.courseId || "",
        courseName: values.courseName || "",
        subject: String(values.subject || ""),
        subjectMode: values.subjectMode || "single",
        level: String(values.level || "General"),
        difficultyLevel: values.difficultyLevel ?? 0.5,
        durationMinutes: Number(values.durationMinutes || 0),
        useSections: values.useSections ?? true,
        updatedAt: serverTimestamp(),
      };
      if (Array.isArray(values.sections) && values.sections.length > 0) {
        update.sections = values.sections;
        update.questionsCount = values.sections.reduce(
          (a: number, s: any) => a + (Number(s.questionsCount) || 0),
          0
        );
        update.questionsTarget = update.questionsCount;
      } else {
        update.sections = [];
        update.questionsCount = Number(values.questionsCount) || 0;
        update.questionsTarget = update.questionsCount;
        update.questionFormat = values.questionFormat || "";
        update.chapters = Array.isArray(values.chapters) ? values.chapters : [];
        update.topics = Array.isArray(values.topics) ? values.topics : [];
        update.tags = Array.isArray(values.tags) ? values.tags : [];
      }
      if (values.markingScheme) update.markingScheme = values.markingScheme;
      setCreating(true);
      try {
        await updateDoc(
          doc(db, "educators", currentUser.uid, "my_tests", editingTest.id),
          pruneUndefined(update)
        );
        toast.success("Test updated");
        setCreateOpen(false);
        setEditingTest(null);
      } catch (err) {
        console.error(err);
        toast.error("Failed to update test");
      } finally {
        setCreating(false);
      }
      return;
    }

    const [templateType, templateId] = String(selectedTemplateId || "none").split(":");

    const educatorTemplate =
      templateType === "edu"
        ? educatorTemplates.find((template) => template.id === templateId)
        : null;

    // Start with the values exactly as submitted by the CreateCustomTest dialog.
    // The dialog has already pre-filled them from the template and allowed the user to edit.
    const payload: any = {
      title: String(values.title || ""),
      description: String(values.description || ""),
      courseId: values.courseId || "",
      courseName: values.courseName || "",
      subject: String(values.subject || ""),
      level: String(values.level || "General"),
      difficultyLevel: values.difficultyLevel ?? 0.5,
      durationMinutes: Number(values.durationMinutes || 0),
      attemptsAllowed: values.attemptsAllowed || globalAttemptsAllowed,
      type: "test",
      source: "custom",
      originSource: "educator",
      createdBy: currentUser.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      targetBatches: [],
    };

    payload.useSections = values.useSections ?? true;

    if (Array.isArray(values.sections) && values.sections.length > 0) {
      payload.sections = values.sections;
      payload.questionsCount = values.sections.reduce(
        (acc: number, s: any) => acc + (Number(s.questionsCount) || 0),
        0
      );
      payload.questionsTarget = payload.questionsCount;
    } else {
      payload.sections = [];
      payload.questionsCount = Number(values.questionsCount) || 0;
      payload.questionsTarget = payload.questionsCount;
      if (values.questionFormat) payload.questionFormat = values.questionFormat;
      if (values.chapter) payload.chapter = values.chapter;
      if (Array.isArray(values.topics) && values.topics.length) payload.topics = values.topics;
      if (Array.isArray(values.tags) && values.tags.length) payload.tags = values.tags;
    }
    if (values.markingScheme) {
      payload.markingScheme = values.markingScheme;
    }
    if (values.syllabus) {
      payload.syllabus = values.syllabus;
    }
    if (values.requiresUnlock !== undefined) {
      payload.requiresUnlock = values.requiresUnlock;
    }
    if (values.price !== undefined) {
      payload.price = values.price;
    }

    // Add origin metadata (template reference only, NOT admin-linked)
    // Tests created from templates are fully editable custom tests.

    if (educatorTemplate) {
      payload.originSource = "educator_template";
      payload.templateId = educatorTemplate.id;
      if (payload.isPublished === undefined)
        payload.isPublished = educatorTemplate.isPublished ?? false;
      if (payload.requiresUnlock === undefined)
        payload.requiresUnlock = educatorTemplate.requiresUnlock ?? true;
      if (payload.price === undefined) payload.price = educatorTemplate.price ?? 0;
    }

    setCreating(true);
    try {
      await addDoc(
        collection(db, "educators", currentUser.uid, "my_tests"),
        pruneUndefined(payload)
      );

      toast.success("Test created");
      setCreateOpen(false);
      setSelectedTemplateId("none");
      setActiveTab("overall");
    } catch (err) {
      console.error(err);
      toast.error("Failed to create test");
    } finally {
      setCreating(false);
    }
  };

  const creatCustomTestState = {
    createOpen,
    setCreateOpen: (open: boolean) => {
      setCreateOpen(open);
      if (!open) setEditingTest(null);
    },
    handleCreateCustom,
    creating,
    selectedTemplateId,
    setSelectedTemplateId,
    templates: templateOptions,
    educatorTemplates,
    accessibleCourses,
    accessibleSubjects,
    onCreateTemplate: () => {
      setCreateOpen(false);
      setCreateTemplateOpen(true);
    },
    initialValues: editingTest ?? undefined,
    isEditing: !!editingTest,
  };

  const moveTestState = {
    moveTestOpen,
    setMoveTestOpen,
    testToMove,
    handleMoveTest,
    folders,
  };

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {!isApp && (
            <div
              className="flex hidden cursor-pointer items-center gap-2 rounded-full p-2 transition-colors hover:bg-primary hover:text-white md:block"
              onClick={() => navigate("/educator")}
            >
              <ArrowLeft className="h-4 w-4" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold">Test Series</h1>
            <p className="hidden text-muted-foreground md:block">
              Import admin tests to your library, or create custom tests (manual questions only).
            </p>
          </div>
        </div>
      </div>

      {/* Search + filters + create — all on one row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-[300px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tests..."
            className="rounded-xl pl-9"
          />
        </div>

        {accessibleCourses.length > 1 && (
          <>
            <Select
              value={courseFilter}
              onValueChange={(v) => {
                setCourseFilter(v);
                setSubjectFilter("all");
              }}
            >
              <SelectTrigger className="h-9 w-[160px] rounded-xl text-sm">
                <SelectValue placeholder="All Courses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Courses</SelectItem>
                {accessibleCourses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={subjectFilter}
              onValueChange={setSubjectFilter}
              disabled={filterSubjectOptions.length === 0}
            >
              <SelectTrigger className="h-9 w-[160px] rounded-xl text-sm">
                <SelectValue placeholder="All Subjects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Subjects</SelectItem>
                {filterSubjectOptions.map((s) => (
                  <SelectItem key={s.id} value={s.name}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(courseFilter !== "all" || subjectFilter !== "all") && (
              <button
                onClick={() => {
                  setCourseFilter("all");
                  setSubjectFilter("all");
                }}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Clear
              </button>
            )}
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          <CreateEducatorTemplate
            open={createTemplateOpen}
            onOpenChange={(open) => {
              setCreateTemplateOpen(open);
              if (!open) setCreateOpen(true);
            }}
          />
          <Button variant="outline" className="rounded-xl" onClick={() => setImportAdminOpen(true)}>
            <Download className="mr-2 h-4 w-4" /> Import Test
          </Button>
          <Button className="gradient-bg text-white shadow-lg" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Create Custom Test
          </Button>
        </div>

        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (!open) setEditingTest(null);
          }}
        >
          <CreateCustomTest {...creatCustomTestState} />
        </Dialog>

        <ImportAdminTestDialog
          open={importAdminOpen}
          onOpenChange={setImportAdminOpen}
          accessibleSubjectNames={accessibleSubjects.map((s) => s.name)}
          currentUserUid={currentUser?.uid ?? ""}
          getIdToken={() => currentUser!.getIdToken()}
          onImported={() => setActiveTab("overall")}
        />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full overflow-x-auto">
            <TabsList className="inline-flex min-w-max rounded-xl">
              <TabsTrigger value="overall" className="rounded-xl">
                Overall
              </TabsTrigger>
              <TabsTrigger value="dpp" className="rounded-xl">
                DPP
              </TabsTrigger>
              <TabsTrigger value="test" className="rounded-xl">
                Test
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={sortBy}
              onValueChange={(v) => setSortBy(v as "newest" | "oldest" | "az")}
            >
              <SelectTrigger className="h-8 w-[140px] rounded-xl text-xs">
                <ArrowUpDown className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="az">A–Z</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className={cn("h-8 w-8 rounded-xl p-0", flatView && "bg-muted")}
              onClick={() => setFlatView((v) => !v)}
              title={flatView ? "Switch to grouped view" : "Switch to flat view"}
            >
              {flatView ? (
                <LayoutGrid className="h-3.5 w-3.5" />
              ) : (
                <LayoutList className="h-3.5 w-3.5" />
              )}
            </Button>
            <NewFolderButton {...folderState} />
          </div>
        </div>

        <div className="mt-6">
          {/* Branch, Program, and Batch Filters */}
          {(branches.length > 1 || programs.length > 1 || allBatches.length > 1) && (
            <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-border/40 bg-muted/30 p-4 dark:bg-card/45">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Folder className="h-3.5 w-3.5" />
                <span>Filter By:</span>
              </div>

              {branches.length > 1 && (
                <div className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Branch:</span>
                  <Select value={branchFilter} onValueChange={handleBranchChange}>
                    <SelectTrigger className="h-9 w-[160px] rounded-xl text-xs">
                      <SelectValue placeholder="All Branches" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Branches</SelectItem>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {programs.length > 1 && (
                <div className="flex items-center gap-2">
                  <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Program:</span>
                  <Select value={programFilter} onValueChange={handleProgramChange}>
                    <SelectTrigger className="h-9 w-[180px] rounded-xl text-xs">
                      <SelectValue placeholder="All Programs" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Programs</SelectItem>
                      {filteredProgramOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {allBatches.length > 1 && (
                <div className="flex items-center gap-2">
                  <Award className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Batch:</span>
                  <Select value={batchFilter} onValueChange={setBatchFilter}>
                    <SelectTrigger className="h-9 w-[220px] rounded-xl text-xs">
                      <SelectValue placeholder="All Batches" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Batches</SelectItem>
                      {filteredBatchOptions.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(branchFilter !== "all" || programFilter !== "all" || batchFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBranchFilter("all");
                    setProgramFilter("all");
                    setBatchFilter("all");
                  }}
                  className="h-8 rounded-xl px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          )}
          {filteredTests.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No tests found"
              description="Create a custom test or generate a DPP."
            />
          ) : (
            <div className="space-y-4">
              {(flatView
                ? [{ type: "flat" as const, key: "__flat__", label: "", tests: sortedTests }]
                : groupedTests
              ).map((group) => {
                const isExpanded = flatView || expandedFolders[group.key] !== false;
                return (
                  <div key={group.key}>
                    {!flatView && (
                      <div className="mb-4">
                        <div
                          onClick={() => toggleFolder(group.key)}
                          className="flex cursor-pointer items-center justify-between rounded-2xl border border-border/60 bg-white p-4 shadow-sm transition-all hover:border-primary/20 hover:shadow-md dark:bg-card"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3.5">
                            {/* Folder Icon Container */}
                            <div className="shrink-0 rounded-xl bg-indigo-50 p-2.5 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                              <Folder className="h-5 w-5" />
                            </div>

                            {/* Text Info */}
                            <div className="min-w-0 flex-1 text-left">
                              {renamingFolderId === group.key ? (
                                <Input
                                  value={renameFolderName}
                                  onChange={(e) => setRenameFolderName(e.target.value)}
                                  onBlur={() => void handleRenameFolder()}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") void handleRenameFolder();
                                    if (e.key === "Escape") setRenamingFolderId(null);
                                  }}
                                  autoFocus
                                  className="h-8 w-48 rounded-lg text-sm font-semibold"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <span className="block truncate text-sm font-semibold text-foreground">
                                  {group.label}
                                </span>
                              )}
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                {group.tests.length} {group.tests.length === 1 ? "test" : "tests"}
                              </span>
                            </div>
                          </div>

                          {/* Actions on Right */}
                          <div
                            className="flex shrink-0 items-center gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {group.type === "folder" && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-lg"
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setRenamingFolderId(group.key);
                                      setRenameFolderName(group.label);
                                    }}
                                  >
                                    <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => void handleReorderFolder(group.key, -1)}
                                  >
                                    Move Up
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => void handleReorderFolder(group.key, 1)}
                                  >
                                    Move Down
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => void handleDeleteFolder(group.key)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}

                            {/* Chevron Toggle */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-black"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFolder(group.key);
                              }}
                            >
                              <ChevronDown
                                className={cn(
                                  "h-5 w-5 transition-transform duration-200",
                                  !isExpanded && "-rotate-90"
                                )}
                              />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                    {isExpanded && (
                      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {group.tests.map((test) => (
                          <motion.div
                            key={test.id}
                            layout
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                          >
                            {(() => {
                              const isAdminLinked =
                                test.originSource === "admin" ||
                                test.source === "imported" ||
                                test.source === "linked_admin" ||
                                test.isQuestionSourceShared === true ||
                                !!test.linkedAdminTestId ||
                                !!test.originalTestId;

                              const isDpp =
                                test.type === "dpp" ||
                                test.type === "from_dpp" ||
                                String(test.title || "")
                                  .toLowerCase()
                                  .includes("dpp");

                              const displayTitle = test.title || (isDpp ? "DPP" : "Untitled");

                              return (
                                <Card className="relative flex h-full flex-col transition-shadow hover:shadow-md">
                                  <CardHeader>
                                    <CardTitle className="flex items-start justify-between gap-2">
                                      <span className="truncate text-lg">{displayTitle}</span>
                                      <div className="flex items-center gap-1">
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8 rounded-xl"
                                            >
                                              <MoreVertical className="h-4 w-4" />
                                            </Button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end" className="rounded-xl">
                                            {!isAdminLinked && (
                                              <DropdownMenuItem
                                                onClick={() => {
                                                  setEditingTest(test);
                                                  setCreateOpen(true);
                                                }}
                                              >
                                                <Pencil className="mr-2 h-4 w-4" /> Edit Settings
                                              </DropdownMenuItem>
                                            )}
                                            <DropdownMenuItem
                                              onClick={() => {
                                                setTestToMove(test);
                                                setMoveTestOpen(true);
                                              }}
                                            >
                                              <Move className="mr-2 h-4 w-4" /> Move to Folder
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                              onClick={() => {
                                                setAssignDialogTest(test);
                                                setAssignDialogOpen(true);
                                              }}
                                            >
                                              <Award className="mr-2 h-4 w-4" /> Assign &amp; Give
                                              Access
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                              className="text-destructive"
                                              onClick={async () => {
                                                if (!currentUser) return;
                                                if (
                                                  !confirm(
                                                    "Delete this test and all its questions?"
                                                  )
                                                )
                                                  return;
                                                try {
                                                  const qs = await getDocs(
                                                    collection(
                                                      db,
                                                      "educators",
                                                      currentUser.uid,
                                                      "my_tests",
                                                      test.id,
                                                      "questions"
                                                    )
                                                  );
                                                  const batch = writeBatch(db);
                                                  qs.forEach((d) => batch.delete(d.ref));
                                                  batch.delete(
                                                    doc(
                                                      db,
                                                      "educators",
                                                      currentUser.uid,
                                                      "my_tests",
                                                      test.id
                                                    )
                                                  );
                                                  await batch.commit();
                                                  toast.success("Test deleted");
                                                } catch (e) {
                                                  console.error(e);
                                                  toast.error("Delete failed");
                                                }
                                              }}
                                            >
                                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                                            </DropdownMenuItem>
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </div>
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent className="flex flex-1 flex-col gap-4">
                                    {/* Template drift banner */}
                                    {driftTests.has(test.id) && (
                                      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs dark:border-amber-700 dark:bg-amber-950/40">
                                        <span className="mt-0.5 text-amber-600 dark:text-amber-400">
                                          ⚠
                                        </span>
                                        <div className="flex-1">
                                          <span className="font-semibold text-amber-700 dark:text-amber-400">
                                            Template updated
                                          </span>
                                          <span className="ml-1 text-amber-600 dark:text-amber-500">
                                            — section constraints may be outdated.
                                          </span>
                                          <button
                                            className="ml-2 text-amber-700 underline hover:no-underline dark:text-amber-400"
                                            onClick={async () => {
                                              if (!currentUser || !test.sourceTemplateId) return;
                                              try {
                                                const tmplSnap = await getDoc(
                                                  doc(db, "templates", test.sourceTemplateId)
                                                );
                                                if (!tmplSnap.exists()) {
                                                  toast.error("Template not found");
                                                  return;
                                                }
                                                const tmpl = tmplSnap.data() as any;
                                                await updateDoc(
                                                  doc(
                                                    db,
                                                    "educators",
                                                    currentUser.uid,
                                                    "my_tests",
                                                    test.id
                                                  ),
                                                  {
                                                    sections: tmpl.sections ?? [],
                                                    markingScheme: tmpl.markingScheme ?? null,
                                                    durationMinutes:
                                                      tmpl.durationMinutes ?? test.durationMinutes,
                                                    sourceTemplateVersion: Number(
                                                      tmpl.version ?? 0
                                                    ),
                                                    updatedAt: serverTimestamp(),
                                                  }
                                                );
                                                setDriftTests((prev) => {
                                                  const s = new Set(prev);
                                                  s.delete(test.id);
                                                  return s;
                                                });
                                                toast.success(
                                                  "Synced section structure from template"
                                                );
                                              } catch (e) {
                                                console.error(e);
                                                toast.error("Sync failed");
                                              }
                                            }}
                                          >
                                            Sync from template
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                    <p className="line-clamp-2 text-sm text-muted-foreground">
                                      {test.description}
                                    </p>

                                    <div className="flex flex-wrap items-center justify-between gap-y-3">
                                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                                        <span className="flex shrink-0 items-center gap-1">
                                          <BookOpen className="h-3 w-3" /> {test.subject || "—"}
                                        </span>
                                        <span className="flex shrink-0 items-center gap-1">
                                          <Clock className="h-3 w-3" />{" "}
                                          {Number(test.durationMinutes || 0)}m
                                        </span>

                                        {isDpp && test.difficulty && (
                                          <Badge
                                            variant="outline"
                                            className={cn(
                                              "h-5 shrink-0 px-2 py-0 text-[10px] capitalize",
                                              test.difficulty === "easy" &&
                                                "border-green-400 text-green-600 dark:border-green-600 dark:text-green-400",
                                              test.difficulty === "medium" &&
                                                "border-amber-400 text-amber-600 dark:border-amber-600 dark:text-amber-400",
                                              test.difficulty === "hard" &&
                                                "border-red-400 text-red-600 dark:border-red-600 dark:text-red-400"
                                            )}
                                          >
                                            {test.difficulty}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>

                                    <div className="mt-4 space-y-2 border-t pt-4">
                                      {/* Quick actions */}
                                      {isDpp &&
                                        test.targetBatches &&
                                        test.targetBatches.length > 0 && (
                                          <div className="flex flex-wrap gap-1.5 pb-1">
                                            {test.targetBatches.map((bId: string) => {
                                              const bMeta = batchMap.get(bId);
                                              return (
                                                <Badge
                                                  key={bId}
                                                  variant="secondary"
                                                  className="rounded-md border border-border/40 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
                                                >
                                                  {bMeta?.name || bId}
                                                </Badge>
                                              );
                                            })}
                                          </div>
                                        )}
                                      {/* Primary actions */}
                                      <div className="flex min-w-0 gap-2">
                                        <Button
                                          className="gradient-bg min-w-0 flex-1 rounded-xl text-white shadow-sm"
                                          size="sm"
                                          onClick={() => {
                                            navigate(`/educator/test-series/${test.id}/questions`);
                                          }}
                                        >
                                          <Edit className="mr-1.5 h-3 w-3 shrink-0" />
                                          <span className="truncate">
                                            {isAdminLinked ? "View Qs" : "Manage Qs"}
                                          </span>
                                        </Button>
                                        {!isAdminLinked &&
                                          ((test.sections || []).length > 0 ||
                                            (test.questionsCount || 0) > 0) && (
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="min-w-0 flex-1 rounded-xl"
                                              disabled={autoFillTestId === test.id}
                                              onClick={() => handleAutoFill(test)}
                                            >
                                              {autoFillTestId === test.id ? (
                                                <Loader2 className="mr-1.5 h-3 w-3 shrink-0 animate-spin" />
                                              ) : (
                                                <FileUp className="mr-1.5 h-3 w-3 shrink-0" />
                                              )}
                                              <span className="truncate">Auto-fill</span>
                                            </Button>
                                          )}
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })()}
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Move Test Dialog */}
          <MoveTest {...moveTestState} />
        </div>
      </Tabs>

      {currentUser && (
        <AssignAndScheduleDialog
          open={assignDialogOpen}
          onOpenChange={(o) => {
            setAssignDialogOpen(o);
            if (!o) setAssignDialogTest(null);
          }}
          test={assignDialogTest}
          allBatches={allBatches}
          educatorId={currentUser.uid}
        />
      )}
    </div>
  );
}
