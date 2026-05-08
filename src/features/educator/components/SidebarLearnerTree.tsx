import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight, Loader2 } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { cn } from "@shared/lib/utils";

type Branch = { id: string; name: string };
type Course = { id: string; name: string };
type Batch = { id: string; name: string };

interface SidebarLearnerTreeProps {
  educatorId: string;
  onNavigate: () => void;
}

export default function SidebarLearnerTree({ educatorId, onNavigate }: SidebarLearnerTreeProps) {
  const [searchParams] = useSearchParams();
  const activeBranch = searchParams.get("branchId") ?? "";
  const activeCourse = searchParams.get("courseId") ?? "";
  const activeBatch = searchParams.get("batchId") ?? "";

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);

  // courses[branchId] and batches[courseId] loaded lazily
  const [courses, setCourses] = useState<Record<string, Course[]>>({});
  const [batches, setBatches] = useState<Record<string, Batch[]>>({});
  const [loadingCourse, setLoadingCourse] = useState<Record<string, boolean>>({});
  const [loadingBatch, setLoadingBatch] = useState<Record<string, boolean>>({});

  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());

  // Load branches on mount
  useEffect(() => {
    if (!educatorId) return;
    getDocs(collection(db, "educators", educatorId, "branches"))
      .then((snap) => {
        setBranches(snap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name ?? d.id })));
      })
      .finally(() => setLoadingBranches(false));
  }, [educatorId]);

  // Auto-expand active branch/course from URL
  useEffect(() => {
    if (activeBranch) setExpandedBranches((p) => new Set([...p, activeBranch]));
    if (activeCourse) setExpandedCourses((p) => new Set([...p, activeCourse]));
  }, [activeBranch, activeCourse]);

  const toggleBranch = (branchId: string) => {
    setExpandedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(branchId)) {
        next.delete(branchId);
      } else {
        next.add(branchId);
        // Lazy-load courses for this branch
        if (!courses[branchId]) {
          setLoadingCourse((lc) => ({ ...lc, [branchId]: true }));
          getDocs(collection(db, "educators", educatorId, "branches", branchId, "courses"))
            .then((snap) => {
              setCourses((prev) => ({
                ...prev,
                [branchId]: snap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name ?? d.id })),
              }));
            })
            .finally(() => setLoadingCourse((lc) => ({ ...lc, [branchId]: false })));
        }
      }
      return next;
    });
  };

  const toggleCourse = (branchId: string, courseId: string) => {
    setExpandedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
        // Lazy-load batches for this course
        if (!batches[courseId]) {
          setLoadingBatch((lb) => ({ ...lb, [courseId]: true }));
          getDocs(collection(db, "educators", educatorId, "branches", branchId, "courses", courseId, "batches"))
            .then((snap) => {
              setBatches((prev) => ({
                ...prev,
                [courseId]: snap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name ?? d.id })),
              }));
            })
            .finally(() => setLoadingBatch((lb) => ({ ...lb, [courseId]: false })));
        }
      }
      return next;
    });
  };

  if (loadingBranches) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading…
      </div>
    );
  }

  if (!branches.length) {
    return <p className="px-2 py-1 text-[11px] text-muted-foreground">No branches yet</p>;
  }

  return (
    <div className="space-y-0.5">
      {branches.map((branch) => {
        const branchExpanded = expandedBranches.has(branch.id);
        const branchActive = activeBranch === branch.id;

        return (
          <div key={branch.id}>
            {/* Branch row */}
            <div className="flex items-center gap-1 group">
              <button
                onClick={() => toggleBranch(branch.id)}
                className="p-0.5 rounded text-muted-foreground hover:text-foreground flex-shrink-0"
              >
                <ChevronRight className={cn("h-3 w-3 transition-transform duration-150", branchExpanded && "rotate-90")} />
              </button>
              <Link
                to={`/educator/learners?branchId=${branch.id}`}
                onClick={onNavigate}
                className={cn(
                  "flex-1 text-[11px] font-medium px-1.5 py-1 rounded truncate transition-colors",
                  branchActive && !activeCourse
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {branch.name}
              </Link>
            </div>

            {/* Courses */}
            {branchExpanded && (
              <div className="ml-4 pl-2 border-l border-border space-y-0.5 mt-0.5">
                {loadingCourse[branch.id] ? (
                  <div className="flex items-center gap-1 px-1 py-1 text-[10px] text-muted-foreground">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" /> Loading…
                  </div>
                ) : (courses[branch.id] ?? []).length === 0 ? (
                  <p className="px-1 py-1 text-[10px] text-muted-foreground">No programs</p>
                ) : (
                  (courses[branch.id] ?? []).map((course) => {
                    const courseExpanded = expandedCourses.has(course.id);
                    const courseActive = activeBranch === branch.id && activeCourse === course.id;

                    return (
                      <div key={course.id}>
                        {/* Course row */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => toggleCourse(branch.id, course.id)}
                            className="p-0.5 rounded text-muted-foreground hover:text-foreground flex-shrink-0"
                          >
                            <ChevronRight className={cn("h-2.5 w-2.5 transition-transform duration-150", courseExpanded && "rotate-90")} />
                          </button>
                          <Link
                            to={`/educator/learners?branchId=${branch.id}&courseId=${course.id}`}
                            onClick={onNavigate}
                            className={cn(
                              "flex-1 text-[10px] font-medium px-1 py-1 rounded truncate transition-colors",
                              courseActive && !activeBatch
                                ? "text-primary bg-primary/10"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            )}
                          >
                            {course.name}
                          </Link>
                        </div>

                        {/* Batches */}
                        {courseExpanded && (
                          <div className="ml-4 pl-2 border-l border-border space-y-0.5 mt-0.5">
                            {loadingBatch[course.id] ? (
                              <div className="flex items-center gap-1 px-1 py-1 text-[10px] text-muted-foreground">
                                <Loader2 className="h-2.5 w-2.5 animate-spin" /> Loading…
                              </div>
                            ) : (batches[course.id] ?? []).length === 0 ? (
                              <p className="px-1 py-1 text-[10px] text-muted-foreground">No batches</p>
                            ) : (
                              (batches[course.id] ?? []).map((batch) => {
                                const batchActive =
                                  activeBranch === branch.id &&
                                  activeCourse === course.id &&
                                  activeBatch === batch.id;
                                return (
                                  <Link
                                    key={batch.id}
                                    to={`/educator/learners?branchId=${branch.id}&courseId=${course.id}&batchId=${batch.id}`}
                                    onClick={onNavigate}
                                    className={cn(
                                      "block text-[10px] px-2 py-1 rounded truncate transition-colors",
                                      batchActive
                                        ? "text-primary bg-primary/10 font-medium"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                    )}
                                  >
                                    {batch.name}
                                  </Link>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
