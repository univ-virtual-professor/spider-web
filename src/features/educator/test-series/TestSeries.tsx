import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Search,
  Plus,
  Minus,
  Edit,
  Trash2,
  FileText,
  Download,
  Clock,
  BookOpen,
  Loader2,
  X,
  Copy,
  CheckCircle2,
  FileUp,
  Folder,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  Move,
  Award,
  Key,
} from "lucide-react";

import { Input } from "@shared/ui/input";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Dialog } from "@shared/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/ui/popover";
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

// Component
import CreateCustomTest from "./CreateCustomTest";
import CreateEducatorTemplate from "./CreateEducatorTemplate";
import NewFolderButton from "./NewFolder";
import ScheduleTest from "./ScheduleTest";
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
  setDoc,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import MoveTest from "./MoveTest";

const ATTEMPTS_OPTIONS = [
  { value: "1", label: "1 Attempt" },
  { value: "2", label: "2 Attempts" },
  { value: "3", label: "3 Attempts" },
  { value: "4", label: "4 Attempts" },
  { value: "5", label: "5 Attempts" },
  { value: "6", label: "6 Attempts" },
  { value: "7", label: "7 Attempts" },
  { value: "8", label: "8 Attempts" },
  { value: "9", label: "9 Attempts" },
  { value: "10", label: "10 Attempts" },
  { value: "0", label: "Unlimited" },
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
  const { firebaseUser: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<"library" | "bank">("library");

  // Data
  const [myTests, setMyTests] = useState<any[]>([]);
  const [bankTests, setBankTests] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  /** testId → true if source template has been updated since test creation */
  const [driftTests, setDriftTests] = useState<Set<string>>(new Set());

  // UI
  const [search, setSearch] = useState("");
  const [importingId, setImportingId] = useState<string | null>(null);
  const [globalAttemptsAllowed, setGlobalAttemptsAllowed] = useState(3);
  const [savingGlobalAttempts, setSavingGlobalAttempts] = useState(false);

  // Create custom test dialog fields
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Folder UI state
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderCreating, setFolderCreating] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [moveTestOpen, setMoveTestOpen] = useState(false);
  const [testToMove, setTestToMove] = useState<any>(null);

  // Batch assignment dialog
  const [batchAssignOpen, setBatchAssignOpen] = useState(false);
  const [batchAssignTest, setBatchAssignTest] = useState<any>(null);
  const [allBatches, setAllBatches] = useState<{ id: string; label: string }[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [savingBatches, setSavingBatches] = useState(false);

  // Access code dialog
  const [acOpen, setAcOpen] = useState(false);
  const [acTestId, setAcTestId] = useState("");
  const [acTestTitle, setAcTestTitle] = useState("");
  const [acCode, setAcCode] = useState("");
  const [acMaxUses, setAcMaxUses] = useState("100");
  const [acExpiry, setAcExpiry] = useState("");
  const [acWindowMinutes, setAcWindowMinutes] = useState("0");
  const [acEditingId, setAcEditingId] = useState<string | null>(null);
  const [acSaving, setAcSaving] = useState(false);
  const [acCopied, setAcCopied] = useState(false);

  // Batch filter (library tab)
  const [batchFilter, setBatchFilter] = useState<string>("all");

  // Template state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("none");
  const [educatorTemplates, setEducatorTemplates] = useState<any[]>([]);
  const [createTemplateOpen, setCreateTemplateOpen] = useState(false);

  // Auto-import state
  const [autoFillTestId, setAutoFillTestId] = useState<string | null>(null);

  // Course/subject filters
  const { courses: accessibleCourses, subjects: accessibleSubjects } = useAccessibleCourses(
    currentUser?.uid ?? ""
  );
  const [courseFilter, setCourseFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");

  // Schedule state
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [testToSchedule, setTestToSchedule] = useState<any>(null);

  // Data subscriptions — re-run whenever the authenticated user changes
  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      setMyTests([]);
      setFolders([]);
      setEducatorTemplates([]);
      setBankTests([]);
      return;
    }

    const uid = currentUser.uid;

    // Load all batches for batch-assignment dialog
    getDocs(collection(db, "educators", uid, "branches")).then(async (branchSnap) => {
      const batchList: { id: string; label: string }[] = [];
      for (const branchDoc of branchSnap.docs) {
        const courseSnap = await getDocs(
          collection(db, "educators", uid, "branches", branchDoc.id, "courses")
        );
        for (const courseDoc of courseSnap.docs) {
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
          batchSnap.docs.forEach((b) =>
            batchList.push({
              id: b.id,
              label: `${branchDoc.data().name} / ${courseDoc.data().name} / ${b.data().name}`,
            })
          );
        }
      }
      setAllBatches(batchList);
    });

    // Load educator preferences
    const unsubEdu = onSnapshot(doc(db, "educators", uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setGlobalAttemptsAllowed(data?.testDefaults?.attemptsAllowed ?? 3);
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
    const myTestsQ = query(collection(db, "educators", uid, "my_tests"));
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
      },
      () => {
        toast.error("Failed to load your tests.");
      }
    );

    // BANK tests: root templates collection
    const bankQ = query(collection(db, "templates"));
    const unsubBank = onSnapshot(
      bankQ,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          // Hide drafts if admin uses isPublished === false
          .filter((t: any) => t?.isPublished !== false);

        setBankTests(rows);
        setLoading(false);
      },
      () => {
        setLoading(false);
        toast.error("Failed to load bank tests.");
      }
    );

    return () => {
      unsubEdu();
      unsubFolders();
      unsubTemplates();
      unsubMy();
      unsubBank();
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
    const sections: any[] = test.sections || [];
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

      // Build section constraints from template sections
      const sectionConstraints = sections.map((s: any) => ({
        id: s.id || s.name,
        name: s.name,
        questionsCount: Number(s.questionsCount) || 0,
        subject: s.subject,
        topics: s.topics,
        tags: s.tags,
        format: s.format,
        difficultyLevel: s.difficultyLevel,
        difficultyTolerance: s.difficultyTolerance ?? 0.25,
        groupTypes: s.groupTypes,
      }));

      // Run group-aware selection
      const { chosen, coverage } = buildAutoFillSelection(
        allQs,
        groupManifests,
        sectionConstraints,
        {
          excludeIds: usedIds,
        }
      );

      // Coverage diagnostics toast
      const shortfalls = coverage.filter((c) => c.shortfall > 0);
      if (shortfalls.length > 0) {
        const msg = shortfalls
          .map((c) => `${c.sectionName}: found ${c.found}/${c.needed}`)
          .join(", ");
        toast.warning(`Partial fill — ${msg}. Add more matching questions to the bank.`);
      }

      if (!chosen.length) {
        toast.warning("No matching questions found. Check section subject/format/topic filters.");
        return;
      }

      // Batch-write chosen questions to the test
      const CHUNK = 490;
      let batch = writeBatch(db);
      let ops = 0;

      for (const q of chosen) {
        const qRef = doc(
          collection(db, "educators", currentUser.uid, "my_tests", test.id, "questions")
        );
        const { id, _source, ...rest } = q as any;
        const qData: any = {
          ...rest,
          bankQuestionId: id,
          questionOrder: order++,
          addedAt: serverTimestamp(),
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

      toast.success(`Auto-filled ${chosen.length} question${chosen.length !== 1 ? "s" : ""}`);
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

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
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

  const groupedTests = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = myTests.filter((t) => {
      if (q) {
        const hay =
          `${t.title || ""} ${t.description || ""} ${t.subject || ""} ${t.level || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (batchFilter !== "all") {
        const batches: string[] = t.targetBatches || [];
        if (!batches.includes(batchFilter)) return false;
      }
      if (courseFilter !== "all" && t.courseId !== courseFilter) return false;
      if (subjectFilter !== "all" && t.subject !== subjectFilter) return false;
      return true;
    });

    const groups: Record<
      string,
      { name: string; type: "custom" | "subject" | "uncategorized"; tests: any[] }
    > = {};

    // 1. Custom Folders (Preserve empty custom folders)
    folders.forEach((f) => {
      groups[f.id] = { name: f.name, type: "custom", tests: [] };
    });

    // 2. Pre-create empty folders for main subjects if they have tests or to keep them visible
    // (Actually, let's only create them if tests exist or user has custom folder with same name)

    // 3. Distribute Tests
    filtered.forEach((t) => {
      if (t.folderId && groups[t.folderId]) {
        groups[t.folderId].tests.push(t);
      } else if (t.subject) {
        const normalizedName = normalizeSubjectName(t.subject);
        const subKey = `subject_${normalizedName.toLowerCase().replace(/\s+/g, "_")}`;
        if (!groups[subKey]) {
          groups[subKey] = { name: normalizedName, type: "subject", tests: [] };
        }
        groups[subKey].tests.push(t);
      } else {
        const unKey = "uncategorized";
        if (!groups[unKey]) {
          groups[unKey] = { name: "Uncategorized", type: "uncategorized", tests: [] };
        }
        groups[unKey].tests.push(t);
      }
    });

    return groups;
  }, [myTests, folders, search, courseFilter, subjectFilter, batchFilter]);

  // Pre-filter bankTests to only courses educator has access to
  const visibleBankTests = useMemo(() => {
    if (accessibleCourses.length === 0) return bankTests;
    const accessibleCourseIds = new Set(accessibleCourses.map((c) => c.id));
    return bankTests.filter((t: any) => !t.courseId || accessibleCourseIds.has(t.courseId));
  }, [bankTests, accessibleCourses]);

  const groupedBankTests = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = visibleBankTests.filter((t) => {
      if (q) {
        const hay =
          `${t.title || ""} ${t.description || ""} ${t.subject || ""} ${t.level || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (courseFilter !== "all" && t.courseId !== courseFilter) return false;
      if (subjectFilter !== "all" && t.subject !== subjectFilter) return false;
      return true;
    });

    const groups: Record<
      string,
      { name: string; type: "subject" | "uncategorized"; tests: any[] }
    > = {};

    filtered.forEach((t) => {
      if (t.subject) {
        const normalizedName = normalizeSubjectName(t.subject);
        const subKey = `bank_subject_${normalizedName.toLowerCase().replace(/\s+/g, "_")}`;
        if (!groups[subKey]) {
          groups[subKey] = { name: normalizedName, type: "subject", tests: [] };
        }
        groups[subKey].tests.push(t);
      } else {
        const unKey = "bank_uncategorized";
        if (!groups[unKey]) {
          groups[unKey] = { name: "Uncategorized", type: "uncategorized", tests: [] };
        }
        groups[unKey].tests.push(t);
      }
    });

    return groups;
  }, [visibleBankTests, search, courseFilter, subjectFilter]);

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
      ...bankTests.map((test: any) => ({
        id: `admin:${test.id}`,
        label: String(test?.title || "Untitled template"),
        group: "admin" as const,
      })),
      ...educatorTemplates.map((template: any) => ({
        id: `edu:${template.id}`,
        label: String(template?.templateName || template?.title || "Custom template"),
        group: "educator" as const,
      })),
    ],
    [bankTests, educatorTemplates]
  );

  const importedAdminTestIds = useMemo(() => {
    const ids = new Set<string>();

    myTests.forEach((test: any) => {
      const linkedId = String(test?.linkedAdminTestId || test?.originalTestId || "").trim();
      const isImportedFromAdmin =
        test?.originSource === "admin" ||
        test?.source === "imported" ||
        test?.source === "linked_admin";

      if (linkedId && isImportedFromAdmin) {
        ids.add(linkedId);
      }
    });

    return ids;
  }, [myTests]);

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

  const openAccessCode = async (test: any) => {
    if (!currentUser) return;
    setAcTestId(test.id);
    setAcTestTitle(test.title || "");
    setAcCode("");
    setAcMaxUses("100");
    setAcExpiry("");
    setAcWindowMinutes("0");
    setAcEditingId(null);

    const snap = await getDocs(
      query(
        collection(db, "educators", currentUser.uid, "accessCodes"),
        where("testSeriesId", "==", test.id)
      )
    );
    if (!snap.empty) {
      const d = snap.docs[0];
      const data = d.data() as any;
      setAcEditingId(d.id);
      setAcCode(data.code || d.id);
      setAcMaxUses(String(data.maxUses || 100));
      setAcExpiry(
        data.expiresAt ? (data.expiresAt as Timestamp).toDate().toISOString().slice(0, 10) : ""
      );
      setAcWindowMinutes(String(data.windowMinutes ?? 0));
    } else {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let code = "";
      for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
      setAcCode(code);
    }
    setAcOpen(true);
  };

  const handleSaveAc = async () => {
    if (!currentUser) return;
    const codeUpper = acCode.trim().toUpperCase();
    const max = Number(acMaxUses);
    if (!codeUpper) {
      toast.error("Enter or generate an access code");
      return;
    }
    if (!Number.isFinite(max) || max <= 0) {
      toast.error("Max uses must be a positive number");
      return;
    }
    const expiresAt = acExpiry ? toEndOfDayTs(acExpiry) : null;
    setAcSaving(true);
    try {
      if (!acEditingId) {
        const ref = doc(db, "educators", currentUser.uid, "accessCodes", codeUpper);
        const existing = await getDoc(ref);
        if (existing.exists()) {
          toast.error("Code already exists, generate a different one");
          return;
        }
        await setDoc(ref, {
          code: codeUpper,
          testSeriesId: acTestId,
          testSeriesTitle: acTestTitle,
          maxUses: max,
          usesUsed: 0,
          expiresAt: expiresAt ?? null,
          windowMinutes: Number(acWindowMinutes) || 0,
          createdAt: serverTimestamp(),
        });
        toast.success("Access code created!");
      } else {
        await updateDoc(doc(db, "educators", currentUser.uid, "accessCodes", acEditingId), {
          testSeriesId: acTestId,
          testSeriesTitle: acTestTitle,
          maxUses: max,
          expiresAt: expiresAt ?? null,
          windowMinutes: Number(acWindowMinutes) || 0,
          updatedAt: serverTimestamp(),
        });
        toast.success("Access code updated!");
      }
      setAcOpen(false);
    } catch {
      toast.error("Failed to save access code");
    } finally {
      setAcSaving(false);
    }
  };

  // Import admin test as a shared reference (no question copy)
  const handleImport = async (bankTest: any) => {
    if (!currentUser) return;

    if (importedAdminTestIds.has(bankTest.id)) {
      toast.info("Already added to your library");
      return;
    }

    setImportingId(bankTest.id);

    try {
      const meta: any = pruneUndefined({
        title: bankTest.title ?? "",
        description: bankTest.description ?? "",
        subject: bankTest.subject ?? "",
        level: bankTest.level ?? "",
        durationMinutes: Number(bankTest.durationMinutes ?? bankTest.duration ?? 0),

        sections: bankTest.sections ?? [],
        instructions: bankTest.instructions ?? "",

        attemptsAllowed: globalAttemptsAllowed,
        markingScheme: bankTest.markingScheme ?? undefined,

        positiveMarks: bankTest.positiveMarks != null ? Number(bankTest.positiveMarks) : undefined,
        negativeMarks: bankTest.negativeMarks != null ? Number(bankTest.negativeMarks) : undefined,

        source: "linked_admin",
        originSource: "admin",
        linkedAdminTestId: bankTest.id,
        originalTestId: bankTest.id,
        isQuestionSourceShared: true,
        targetBatches: [],

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: currentUser.uid,
        questionsCount: Math.max(
          0,
          Number(bankTest.questionsCount ?? bankTest.questionCount ?? bankTest.totalQuestions ?? 0)
        ),
      });

      await setDoc(doc(db, "educators", currentUser.uid, "my_tests", bankTest.id), meta);

      toast.success("Added as linked admin test");
      setActiveTab("library");
    } catch (e) {
      console.error(e);
      toast.error("Failed to import test");
    } finally {
      setImportingId(null);
    }
  };

  // Create educator custom test (NO question bank import allowed, manual questions only)
  const handleCreateCustom = async (values: any) => {
    if (!currentUser) return;

    const [templateType, templateId] = String(selectedTemplateId || "none").split(":");
    const adminTemplate =
      templateType === "admin" ? bankTests.find((test) => test.id === templateId) : null;
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
      source: "custom",
      originSource: "educator",
      createdBy: currentUser.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      questionsCount: 0,
      targetBatches: [],
    };

    if (values.sections) {
      payload.sections = values.sections;
      payload.questionsCount = values.sections.reduce(
        (acc: number, s: any) => acc + (Number(s.questionsCount) || 0),
        0
      );
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
    if (adminTemplate) {
      payload.templateRef = { source: "admin", id: adminTemplate.id };
      if (payload.isPublished === undefined)
        payload.isPublished = adminTemplate.isPublished ?? false;
      if (payload.requiresUnlock === undefined)
        payload.requiresUnlock = adminTemplate.requiresUnlock ?? true;
      if (payload.price === undefined) payload.price = adminTemplate.price ?? 0;
    }

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
      setActiveTab("library");
    } catch (err) {
      console.error(err);
      toast.error("Failed to create test");
    } finally {
      setCreating(false);
    }
  };

  const creatCustomTestState = {
    createOpen,
    setCreateOpen,
    handleCreateCustom,
    creating,
    selectedTemplateId,
    setSelectedTemplateId,
    templates: templateOptions,
    bankTests,
    educatorTemplates,
    accessibleCourses,
    accessibleSubjects,
    onCreateTemplate: () => {
      setCreateOpen(false);
      setCreateTemplateOpen(true);
    },
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
        <div>
          <h1 className="text-2xl font-bold">Test Series</h1>
          <p className="text-muted-foreground">
            Import admin tests to your library, or create custom tests (manual questions only).
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-white px-4 py-2 shadow-sm dark:bg-card">
          <div className="shrink-0 rounded-xl bg-primary/10 p-2 text-primary">
            <Award className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase leading-tight tracking-wider text-muted-foreground">
              Default Limit
            </span>
            <span className="text-xs font-semibold text-foreground">Global Attempts</span>
          </div>
          <div className="mx-2 h-8 w-px shrink-0 bg-border/60" />
          {savingGlobalAttempts ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const idx = ATTEMPTS_OPTIONS.findIndex(
                    (o) => o.value === String(globalAttemptsAllowed)
                  );
                  const prev =
                    ATTEMPTS_OPTIONS[(idx - 1 + ATTEMPTS_OPTIONS.length) % ATTEMPTS_OPTIONS.length];
                  handleSaveGlobalAttempts(Number(prev.value));
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
              >
                <Minus className="h-3 w-3" />
              </button>
              <div className="flex min-w-[52px] flex-col items-center">
                <span className="text-lg font-black leading-none text-primary">
                  {globalAttemptsAllowed === 0 ? "∞" : globalAttemptsAllowed}
                </span>
                <span className="text-[9px] font-medium text-muted-foreground">
                  {globalAttemptsAllowed === 0
                    ? "unlimited"
                    : globalAttemptsAllowed === 1
                      ? "attempt"
                      : "attempts"}
                </span>
              </div>
              <button
                disabled={globalAttemptsAllowed >= 2}
                onClick={() => {
                  const idx = ATTEMPTS_OPTIONS.findIndex(
                    (o) => o.value === String(globalAttemptsAllowed)
                  );
                  const next = ATTEMPTS_OPTIONS[(idx + 1) % ATTEMPTS_OPTIONS.length];
                  handleSaveGlobalAttempts(Number(next.value));
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          )}
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

        {accessibleCourses.length > 0 && (
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
          <Button className="gradient-bg text-white shadow-lg" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Create Custom Test
          </Button>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <CreateCustomTest {...creatCustomTestState} />
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full overflow-x-auto">
            <TabsList className="inline-flex min-w-max rounded-xl">
              <TabsTrigger value="library" className="rounded-xl">
                Your Library
              </TabsTrigger>
              <TabsTrigger value="bank" className="rounded-xl">
                Admin Bank
              </TabsTrigger>
            </TabsList>
          </div>

          <NewFolderButton {...folderState} />
        </div>

        {/* Library */}
        <TabsContent value="library" className="mt-6">
          {allBatches.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="shrink-0 text-sm text-muted-foreground">Filter by Batch:</span>
              <Select value={batchFilter} onValueChange={setBatchFilter}>
                <SelectTrigger className="h-8 w-[220px] rounded-xl text-sm">
                  <SelectValue placeholder="All Batches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Batches</SelectItem>
                  {allBatches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {batchFilter !== "all" && (
                <button
                  onClick={() => setBatchFilter("all")}
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
          )}
          {Object.keys(groupedTests).length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No tests found"
              description="Create a custom test or import from the admin bank."
            />
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedTests).map(([groupId, group]) => {
                const isExpanded = !!expandedFolders[groupId]; // default closed
                return (
                  <div key={groupId} className="space-y-4">
                    <div
                      className="group flex cursor-pointer items-center justify-between rounded-xl bg-muted/20 p-2"
                      onClick={() => toggleFolder(groupId)}
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5" />
                        ) : (
                          <ChevronRight className="h-5 w-5" />
                        )}
                        <Folder
                          className={cn(
                            "h-5 w-5",
                            group.type === "custom"
                              ? "fill-primary/20 text-primary"
                              : "text-muted-foreground"
                          )}
                        />
                        <h3 className="text-lg font-semibold">{group.name}</h3>
                        <Badge variant="secondary" className="ml-2 rounded-full">
                          {group.tests.length}
                        </Badge>
                      </div>

                      {group.type === "custom" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-xl text-destructive opacity-0 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFolder(groupId);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="grid grid-cols-1 gap-6 pl-4 md:grid-cols-2 lg:grid-cols-3">
                        {group.tests.length === 0 ? (
                          <p className="col-span-full py-4 text-sm italic text-muted-foreground">
                            No tests in this folder.
                          </p>
                        ) : (
                          group.tests.map((test) => (
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

                                return (
                                  <Card className="relative flex h-full flex-col transition-shadow hover:shadow-md">
                                    <CardHeader>
                                      <CardTitle className="flex items-start justify-between gap-2">
                                        <span className="truncate text-lg">{test.title}</span>
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
                                                  setBatchAssignTest(test);
                                                  setSelectedBatchIds(test.targetBatches || []);
                                                  setBatchAssignOpen(true);
                                                }}
                                              >
                                                <Award className="mr-2 h-4 w-4" /> Assign to Batches
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                onClick={() => openAccessCode(test)}
                                              >
                                                <Key className="mr-2 h-4 w-4" /> Access Code
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                onClick={() => {
                                                  setTestToSchedule(test);
                                                  setScheduleOpen(true);
                                                }}
                                              >
                                                <Clock className="mr-2 h-4 w-4" /> Schedule
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
                                                        tmpl.durationMinutes ??
                                                        test.durationMinutes,
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

                                      <div className="mt-auto flex flex-wrap items-center justify-between gap-y-3">
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                                          <span className="flex shrink-0 items-center gap-1">
                                            <BookOpen className="h-3 w-3" /> {test.subject || "—"}
                                          </span>
                                          <span className="flex shrink-0 items-center gap-1">
                                            <Clock className="h-3 w-3" />{" "}
                                            {Number(test.durationMinutes || 0)}m
                                          </span>
                                          {isAdminLinked ? (
                                            <Badge
                                              variant="outline"
                                              className="h-5 shrink-0 px-2 py-0 text-[10px]"
                                            >
                                              Admin Linked
                                            </Badge>
                                          ) : test.source === "imported" ? (
                                            <Badge
                                              variant="secondary"
                                              className="h-5 shrink-0 px-2 py-0 text-[10px]"
                                            >
                                              Imported
                                            </Badge>
                                          ) : (
                                            <Badge className="h-5 shrink-0 px-2 py-0 text-[10px]">
                                              Custom
                                            </Badge>
                                          )}
                                        </div>

                                        <Popover>
                                          <PopoverTrigger asChild>
                                            <div className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-muted/30 px-2 py-1 hover:bg-muted/50">
                                              <span className="text-[9px] font-bold uppercase text-muted-foreground">
                                                Attempts:
                                              </span>
                                              <span className="text-[10px] font-bold">
                                                {(test.attemptsAllowed ?? 3) === 0
                                                  ? "∞"
                                                  : (test.attemptsAllowed ?? 3)}
                                              </span>
                                            </div>
                                          </PopoverTrigger>
                                          <PopoverContent
                                            className="w-auto p-2"
                                            align="end"
                                            sideOffset={4}
                                          >
                                            <ScrollPicker
                                              options={ATTEMPTS_OPTIONS}
                                              value={String(test.attemptsAllowed ?? 3)}
                                              onChange={(v) =>
                                                handleUpdateTestAttempts(test.id, Number(v))
                                              }
                                            />
                                          </PopoverContent>
                                        </Popover>
                                      </div>

                                      <div className="mt-4 space-y-2 border-t pt-4">
                                        {/* Quick actions */}
                                        <div className="flex items-center gap-1">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="flex-1 rounded-xl text-xs"
                                            onClick={() => {
                                              setTestToSchedule(test);
                                              setScheduleOpen(true);
                                            }}
                                          >
                                            <Clock className="mr-1 h-3 w-3" />
                                            Schedule
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="flex-1 rounded-xl text-xs"
                                            onClick={() => {
                                              setBatchAssignTest(test);
                                              setSelectedBatchIds(test.targetBatches || []);
                                              setBatchAssignOpen(true);
                                            }}
                                          >
                                            <Award className="mr-1 h-3 w-3" />
                                            Batches
                                            {(test.targetBatches || []).length > 0 && (
                                              <span className="ml-1 rounded-full bg-primary/10 px-1 text-[10px] font-medium text-primary">
                                                {test.targetBatches.length}
                                              </span>
                                            )}
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="flex-1 rounded-xl text-xs"
                                            onClick={() => openAccessCode(test)}
                                          >
                                            <Key className="mr-1 h-3 w-3" />
                                            Code
                                          </Button>
                                        </div>
                                        {/* Primary actions */}
                                        <div className="flex min-w-0 gap-2">
                                          <Button
                                            className="gradient-bg min-w-0 flex-1 rounded-xl text-white shadow-sm"
                                            size="sm"
                                            onClick={() => {
                                              navigate(
                                                `/educator/test-series/${test.id}/questions`
                                              );
                                            }}
                                          >
                                            <Edit className="mr-1.5 h-3 w-3 shrink-0" />
                                            <span className="truncate">
                                              {isAdminLinked ? "View Qs" : "Manage Qs"}
                                            </span>
                                          </Button>
                                          {!isAdminLinked && (test.sections || []).length > 0 && (
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
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Move Test Dialog */}
          <MoveTest {...moveTestState} />
        </TabsContent>

        {/* Admin Bank */}
        <TabsContent value="bank" className="mt-6">
          {Object.keys(groupedBankTests).length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No bank tests found"
              description="No admin tests are available for import yet."
            />
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedBankTests).map(([groupId, group]) => {
                const isExpanded = !!expandedFolders[groupId]; // default closed
                return (
                  <div key={groupId} className="space-y-4">
                    <div
                      className="group flex cursor-pointer items-center justify-between rounded-xl bg-muted/20 p-2"
                      onClick={() => toggleFolder(groupId)}
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5" />
                        ) : (
                          <ChevronRight className="h-5 w-5" />
                        )}
                        <Folder className="h-5 w-5 text-muted-foreground" />
                        <h3 className="text-lg font-semibold">{group.name}</h3>
                        <Badge variant="secondary" className="ml-2 rounded-full">
                          {group.tests.length}
                        </Badge>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="grid grid-cols-1 gap-6 pl-4 md:grid-cols-2 lg:grid-cols-3">
                        {group.tests.map((test) => {
                          const alreadyLinked = importedAdminTestIds.has(test.id);

                          return (
                            <Card
                              key={test.id}
                              className="border-dashed bg-muted/30 transition-colors hover:border-primary"
                            >
                              <CardHeader>
                                <CardTitle className="flex items-start justify-between">
                                  <span className="truncate">{test.title}</span>
                                  <Badge variant="outline">Admin</Badge>
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-4">
                                <p className="line-clamp-2 text-sm text-muted-foreground">
                                  {test.description}
                                </p>
                                <div className="flex gap-2 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <BookOpen className="h-3 w-3" /> {test.subject || "—"}
                                  </span>
                                  <span>•</span>
                                  <span>{test.level || "—"}</span>
                                </div>
                                <Button
                                  className="w-full rounded-xl"
                                  disabled={importingId === test.id || alreadyLinked}
                                  onClick={() => handleImport(test)}
                                >
                                  {alreadyLinked ? (
                                    <>
                                      <CheckCircle2 className="mr-2 h-4 w-4" /> Added to Library
                                    </>
                                  ) : importingId === test.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <Download className="mr-2 h-4 w-4" /> Import to Library
                                    </>
                                  )}
                                </Button>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Access Code Dialog */}
      {acOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {acEditingId ? "Edit Access Code" : "Create Access Code"}
              </h2>
              <button
                onClick={() => setAcOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Test: <span className="font-medium text-foreground">{acTestTitle}</span>
            </p>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Access Code</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg border bg-background px-3 py-2 font-mono text-sm uppercase"
                    value={acCode}
                    onChange={(e) => setAcCode(e.target.value.toUpperCase())}
                    disabled={!!acEditingId}
                    placeholder="Enter or generate"
                  />
                  <button
                    className="rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                    onClick={() => {
                      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
                      let code = "";
                      for (let i = 0; i < 8; i++)
                        code += chars.charAt(Math.floor(Math.random() * chars.length));
                      setAcCode(code);
                    }}
                    disabled={!!acEditingId}
                  >
                    Generate
                  </button>
                  {acCode && (
                    <button
                      className="rounded-lg border px-3 py-2 text-sm hover:bg-muted"
                      onClick={() => {
                        navigator.clipboard.writeText(acCode);
                        setAcCopied(true);
                        setTimeout(() => setAcCopied(false), 2000);
                      }}
                    >
                      {acCopied ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Max Uses</label>
                  <input
                    type="number"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                    value={acMaxUses}
                    onChange={(e) => setAcMaxUses(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Expiry Date</label>
                  <input
                    type="date"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                    value={acExpiry}
                    onChange={(e) => setAcExpiry(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Access Window (minutes, 0 = unlimited)
                </label>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  value={acWindowMinutes}
                  onChange={(e) => setAcWindowMinutes(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Students can unlock only within this many minutes of code creation.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                className="rounded-lg border px-4 py-2 text-sm hover:bg-muted"
                onClick={() => setAcOpen(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                disabled={acSaving}
                onClick={handleSaveAc}
              >
                {acSaving ? "Saving..." : acEditingId ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Assignment Dialog */}
      {batchAssignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-lg">
            <h2 className="text-lg font-semibold">Assign to Batches</h2>
            <p className="text-sm text-muted-foreground">
              Only students in the selected batches will see this test.
            </p>
            {allBatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No batches found. Create batches in Divisions first.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {selectedBatchIds.length} of {allBatches.length} selected
                  </span>
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() =>
                      selectedBatchIds.length === allBatches.length
                        ? setSelectedBatchIds([])
                        : setSelectedBatchIds(allBatches.map((b) => b.id))
                    }
                  >
                    {selectedBatchIds.length === allBatches.length ? "Deselect All" : "Select All"}
                  </button>
                </div>
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border p-2">
                  {allBatches.map((b) => (
                    <label
                      key={b.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={selectedBatchIds.includes(b.id)}
                        onChange={(e) =>
                          setSelectedBatchIds((prev) =>
                            e.target.checked ? [...prev, b.id] : prev.filter((x) => x !== b.id)
                          )
                        }
                      />
                      <span className="text-sm">{b.label}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                className="rounded border px-4 py-2 text-sm hover:bg-muted"
                onClick={() => setBatchAssignOpen(false)}
              >
                Cancel
              </button>
              <button
                className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                disabled={savingBatches || !currentUser}
                onClick={async () => {
                  if (!currentUser || !batchAssignTest) return;
                  setSavingBatches(true);
                  try {
                    await updateDoc(
                      doc(db, "educators", currentUser.uid, "my_tests", batchAssignTest.id),
                      { targetBatches: selectedBatchIds, updatedAt: serverTimestamp() }
                    );
                    toast.success("Batch assignment saved");
                    setBatchAssignOpen(false);
                  } catch {
                    toast.error("Failed to save");
                  } finally {
                    setSavingBatches(false);
                  }
                }}
              >
                {savingBatches ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule dialog */}
      {currentUser && (
        <ScheduleTest
          open={scheduleOpen}
          onOpenChange={(v) => {
            setScheduleOpen(v);
            if (!v) setTestToSchedule(null);
          }}
          test={testToSchedule}
          userId={currentUser.uid}
        />
      )}
    </div>
  );
}
