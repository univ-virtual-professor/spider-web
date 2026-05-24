import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@shared/ui/dialog";
import { Input } from "@shared/ui/input";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Search, Clock, BookOpen, ListChecks, Download, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@shared/lib/firebase";

type AdminTest = {
  id: string;
  title: string;
  description?: string;
  subject?: string;
  courseId?: string;
  durationMinutes?: number;
  questionsCount?: number;
  sections?: Array<{ id?: string; name?: string; questionsCount?: number }>;
  markingScheme?: { correct?: number; incorrect?: number };
  isPublished: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accessibleSubjectNames: string[];
  currentUserUid: string;
  getIdToken: () => Promise<string>;
  onImported: () => void;
};

export default function ImportAdminTestDialog({
  open,
  onOpenChange,
  accessibleSubjectNames,
  currentUserUid,
  getIdToken,
  onImported,
}: Props) {
  const [adminTests, setAdminTests] = useState<AdminTest[]>([]);
  const [loadingTests, setLoadingTests] = useState(false);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [importingId, setImportingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");

  // Fetch published admin tests + already-imported IDs when dialog opens
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoadingTests(true);
    setSearch("");
    setSubjectFilter("all");

    Promise.all([
      // All published admin tests
      getDocs(query(collection(db, "test_series"), where("isPublished", "==", true))),
      // Educator's tests that were imported from admin
      getDocs(
        query(
          collection(db, "educators", currentUserUid, "my_tests"),
          where("importedFromAdminTestId", "!=", null)
        )
      ),
    ])
      .then(([adminSnap, myTestsSnap]) => {
        if (cancelled) return;

        const tests: AdminTest[] = adminSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AdminTest, "id">),
        }));
        setAdminTests(tests);

        const alreadyImported = new Set<string>(
          myTestsSnap.docs
            .map((d) => String(d.data().importedFromAdminTestId || ""))
            .filter(Boolean)
        );
        setImportedIds(alreadyImported);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[ImportAdminTestDialog] fetch error", err);
        toast.error("Failed to load admin tests");
      })
      .finally(() => {
        if (!cancelled) setLoadingTests(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, currentUserUid]);

  // Subject options derived from the loaded tests (filtered by educator's accessible subjects)
  const subjectOptions = useMemo(() => {
    const accessible = new Set(accessibleSubjectNames.map((s) => s.toLowerCase()));
    const seen = new Set<string>();
    for (const t of adminTests) {
      const sub = (t.subject || "").trim();
      if (sub && (accessible.size === 0 || accessible.has(sub.toLowerCase()))) {
        seen.add(sub);
      }
    }
    return Array.from(seen).sort();
  }, [adminTests, accessibleSubjectNames]);

  const visibleTests = useMemo(() => {
    const accessible = new Set(accessibleSubjectNames.map((s) => s.toLowerCase()));
    const q = search.trim().toLowerCase();

    return adminTests.filter((t) => {
      // Scope to educator's allowed subjects (skip filter if educator has no restrictions)
      const sub = (t.subject || "").trim().toLowerCase();
      if (accessible.size > 0 && sub && !accessible.has(sub)) return false;

      if (subjectFilter !== "all" && (t.subject || "").trim() !== subjectFilter) return false;

      if (q) {
        const hay = `${t.title || ""} ${t.description || ""} ${t.subject || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [adminTests, accessibleSubjectNames, subjectFilter, search]);

  const handleImport = async (test: AdminTest) => {
    if (importingId) return; // one at a time

    setImportingId(test.id);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/educator/import-admin-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ adminTestId: test.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data?.error || "Import failed";
        toast.error(msg);
        return;
      }

      setImportedIds((prev) => new Set(prev).add(test.id));

      if (data.alreadyImported) {
        toast.info(`"${test.title}" is already in your library`);
      } else {
        toast.success(
          `"${test.title}" imported — ${data.questionsImported ?? 0} questions copied to your library`
        );
        onImported();
      }
    } catch (err) {
      console.error("[ImportAdminTestDialog] import error", err);
      toast.error("Import failed. Please try again.");
    } finally {
      setImportingId(null);
    }
  };

  const sectionCount = (t: AdminTest) =>
    Array.isArray(t.sections) ? t.sections.length : 0;

  const questionCount = (t: AdminTest) => {
    if (typeof t.questionsCount === "number" && t.questionsCount > 0) return t.questionsCount;
    if (Array.isArray(t.sections) && t.sections.length > 0) {
      return t.sections.reduce((acc, s) => acc + (Number(s.questionsCount) || 0), 0);
    }
    return 0;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden rounded-2xl p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Import Admin Tests
          </DialogTitle>
          <DialogDescription>
            Browse published tests created by admin. Importing copies the test and all its
            questions into your library — you can edit and schedule them independently.
          </DialogDescription>
        </DialogHeader>

        {/* Filters */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-6 py-3">
          <div className="relative min-w-[180px] flex-1 sm:max-w-[280px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tests..."
              className="rounded-xl pl-9"
            />
          </div>
          {subjectOptions.length > 0 && (
            <Select value={subjectFilter} onValueChange={setSubjectFilter}>
              <SelectTrigger className="h-9 w-[160px] rounded-xl text-sm">
                <SelectValue placeholder="All Subjects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Subjects</SelectItem>
                {subjectOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Test list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loadingTests ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : visibleTests.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <BookOpen className="h-8 w-8 opacity-40" />
              <p>
                {adminTests.length === 0
                  ? "No published admin tests yet"
                  : "No tests match your filters"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleTests.map((test) => {
                const alreadyImported = importedIds.has(test.id);
                const isImporting = importingId === test.id;
                const qCount = questionCount(test);
                const sCount = sectionCount(test);

                return (
                  <div
                    key={test.id}
                    className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold">{test.title}</p>
                        {test.subject && (
                          <Badge variant="secondary" className="rounded-full px-2 py-0 text-xs">
                            {test.subject}
                          </Badge>
                        )}
                        {alreadyImported && (
                          <Badge className="rounded-full bg-green-100 px-2 py-0 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Imported
                          </Badge>
                        )}
                      </div>
                      {test.description && (
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          {test.description}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {test.durationMinutes ?? "—"} min
                        </span>
                        <span className="flex items-center gap-1">
                          <BookOpen className="h-3 w-3" />
                          {qCount > 0 ? `${qCount} questions` : "Questions TBD"}
                        </span>
                        {sCount > 0 && (
                          <span className="flex items-center gap-1">
                            <ListChecks className="h-3 w-3" />
                            {sCount} section{sCount !== 1 ? "s" : ""}
                          </span>
                        )}
                        {test.markingScheme?.correct != null && (
                          <span className="text-green-600">
                            +{test.markingScheme.correct}
                            {test.markingScheme.incorrect != null &&
                              ` / ${test.markingScheme.incorrect}`}
                          </span>
                        )}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant={alreadyImported ? "outline" : "default"}
                      className="shrink-0 rounded-xl"
                      disabled={alreadyImported || isImporting || !!importingId}
                      onClick={() => handleImport(test)}
                    >
                      {isImporting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : alreadyImported ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <>
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          Import
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
