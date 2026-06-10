import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { format, isSameDay } from "date-fns";

import { Calendar as CalendarIcon } from "lucide-react";
import MetricCard from "./MetricCard";
import { Skeleton } from "@shared/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/ui/popover";
import { Calendar } from "@shared/ui/calendar";
import { Button } from "@shared/ui/button";

// Using the same types from Dashboard.tsx
type StudentDoc = {
  id: string;
  name?: string;
  displayName?: string;
  fullName?: string;
  [key: string]: any;
};

type AttemptDoc = {
  id: string;
  studentId?: string;
  studentName?: string;
  score?: number | string;
  maxScore?: number | string;
  testTitle?: string;
  submittedAt?: any;
  createdAt?: any;
  [key: string]: any;
};

interface DashboardStatsGridProps {
  students: StudentDoc[];
  attempts: AttemptDoc[];
  activeBatchesCount: number;
  isLoading: boolean;
  selectedBranch?: string;
  selectedCourse?: string;
  selectedBatch?: string;
}

export default function DashboardStatsGrid({
  students,
  attempts,
  activeBatchesCount,
  isLoading,
  selectedBranch = "All",
  selectedCourse = "All",
  selectedBatch = "All",
}: DashboardStatsGridProps) {
  const navigate = useNavigate();

  // Internal states for Date Pickers
  const [dppDate, setDppDate] = useState<Date | undefined>(new Date());
  const [testDate, setTestDate] = useState<Date | undefined>(new Date());
  const [isDppLoading, setIsDppLoading] = useState(false);
  const [isTestLoading, setIsTestLoading] = useState(false);

  const [isDppPopoverOpen, setIsDppPopoverOpen] = useState(false);
  const [isTestPopoverOpen, setIsTestPopoverOpen] = useState(false);

  // Derived Metrics
  const totalStudents = students.length;

  const { weakStudentsCount, weakStudents } = useMemo(() => {
    if (!attempts.length) return { weakStudentsCount: 0, weakStudents: [] };

    interface StudentScore {
      id: string;
      totalScore: number;
      maxScore: number;
      name: string;
      email?: string;
      attemptsCount: number;
    }

    const studentScores: Record<string, StudentScore> = {};

    attempts.forEach((a) => {
      const stId = a.studentId;
      if (!stId) return;
      if (!studentScores[stId]) {
        const student = students.find((s) => s.id === stId);
        studentScores[stId] = {
          id: stId,
          totalScore: 0,
          maxScore: 0,
          name:
            student?.name ||
            student?.displayName ||
            student?.fullName ||
            a.studentName ||
            "Unknown Student",
          email: student?.email,
          attemptsCount: 0,
        };
      }
      studentScores[stId].totalScore += Number(a.score || 0);
      studentScores[stId].maxScore += Number(a.maxScore || 0);
      studentScores[stId].attemptsCount += 1;
    });

    const weakList: Array<StudentScore & { percentage: number }> = [];

    Object.values(studentScores).forEach((st) => {
      if (st.maxScore > 0) {
        const pct = (st.totalScore / st.maxScore) * 100;
        if (pct < 40) {
          weakList.push({
            ...st,
            percentage: Math.round(pct),
          });
        }
      }
    });

    weakList.sort((a, b) => a.percentage - b.percentage);

    return {
      weakStudentsCount: weakList.length,
      weakStudents: weakList,
    };
  }, [attempts, students]);

  const getAttemptsForDate = (date: Date | undefined, type: "dpp" | "test") => {
    if (!date) return 0;
    return attempts.filter((a) => {
      const d = a.submittedAt?.toMillis
        ? a.submittedAt.toMillis()
        : a.createdAt?.toMillis
          ? a.createdAt.toMillis()
          : null;
      if (!d) return false;
      const attemptDate = new Date(d);
      if (!isSameDay(attemptDate, date)) return false;

      const title = String(a.testTitle || "").toLowerCase();
      if (type === "dpp") return title.includes("dpp") || title.includes("practice");
      return !title.includes("dpp") && !title.includes("practice");
    }).length;
  };

  const dppAttemptsCount = useMemo(() => getAttemptsForDate(dppDate, "dpp"), [attempts, dppDate]);
  const testAttemptsCount = useMemo(
    () => getAttemptsForDate(testDate, "test"),
    [attempts, testDate]
  );

  const handleDppDateChange = (date: Date | undefined) => {
    setIsDppLoading(true);
    setDppDate(date);
    setTimeout(() => setIsDppLoading(false), 600); // Simulate network delay for specific card
  };

  const handleTestDateChange = (date: Date | undefined) => {
    setIsTestLoading(true);
    setTestDate(date);
    setTimeout(() => setIsTestLoading(false), 600); // Simulate network delay for specific card
  };

  return (
    <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 sm:grid-cols-6 md:grid-cols-12 lg:grid-cols-10">
      {/* Total Students */}
      <div className="col-span-1 h-full sm:col-span-2 md:col-span-3 lg:col-span-2">
        {isLoading ? (
          <Skeleton className="h-[120px] w-full rounded-xl" />
        ) : (
          <div
            onClick={() => navigate("/educator/students")}
            className="h-full cursor-pointer transition-transform hover:scale-[1.02]"
          >
            <MetricCard title="Total Students" value={totalStudents} delay={0.1} />
          </div>
        )}
      </div>

      {/* Active Batches */}
      <div className="col-span-1 h-full sm:col-span-2 md:col-span-3 lg:col-span-2">
        {isLoading ? (
          <Skeleton className="h-[120px] w-full rounded-xl" />
        ) : (
          <div
            onClick={() => navigate("/educator/batches")}
            className="h-full cursor-pointer transition-transform hover:scale-[1.02]"
          >
            <MetricCard title="Active Batches" value={activeBatchesCount} delay={0.2} />
          </div>
        )}
      </div>

      {/* Needs Attention */}
      <div className="col-span-1 h-full sm:col-span-2 md:col-span-3 lg:col-span-2">
        {isLoading ? (
          <Skeleton className="h-[120px] w-full rounded-xl" />
        ) : (
          <div
            onClick={() =>
              navigate("/educator/needs-attention", {
                state: {
                  initialBranch: selectedBranch,
                  initialCourse: selectedCourse,
                  initialBatch: selectedBatch,
                },
              })
            }
            className="h-full cursor-pointer transition-transform hover:scale-[1.02]"
          >
            <MetricCard title="Needs Attention (< 40%)" value={weakStudentsCount} delay={0.4} />
          </div>
        )}
      </div>

      {/* DPP Attempts */}
      <div className="col-span-1 h-full sm:col-span-3 md:col-span-3 lg:col-span-2">
        {isLoading || isDppLoading ? (
          <Skeleton className="h-[120px] w-full rounded-xl" />
        ) : (
          <div className="h-full cursor-pointer transition-transform hover:scale-[1.02]">
            <MetricCard
              title={
                <div className="flex flex-col items-start gap-1">
                  <span>DPP Attempts</span>
                  <div onClick={(e) => e.stopPropagation()}>
                    <Popover open={isDppPopoverOpen} onOpenChange={setIsDppPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 rounded-md bg-muted/50 px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <CalendarIcon className="mr-1 h-3 w-3" />
                          {dppDate ? format(dppDate, "MMM d, yyyy") : "Any Date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={dppDate}
                          onSelect={(d) => {
                            handleDppDateChange(d);
                            setIsDppPopoverOpen(false);
                          }}
                          disabled={(date) => date > new Date()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              }
              value={dppAttemptsCount}
              delay={0.5}
            />
          </div>
        )}
      </div>

      {/* Test Attempts */}
      <div className="col-span-1 h-full xs:col-span-2 sm:col-span-3 md:col-span-12 lg:col-span-2">
        {isLoading || isTestLoading ? (
          <Skeleton className="h-[120px] w-full rounded-xl" />
        ) : (
          <div className="h-full cursor-pointer transition-transform hover:scale-[1.02]">
            <MetricCard
              title={
                <div className="flex flex-col items-start gap-1">
                  <span>Test Attempts</span>
                  <div onClick={(e) => e.stopPropagation()}>
                    <Popover open={isTestPopoverOpen} onOpenChange={setIsTestPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 rounded-md bg-muted/50 px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <CalendarIcon className="mr-1 h-3 w-3" />
                          {testDate ? format(testDate, "MMM d, yyyy") : "Any Date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={testDate}
                          onSelect={(d) => {
                            handleTestDateChange(d);
                            setIsTestPopoverOpen(false);
                          }}
                          disabled={(date) => date > new Date()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              }
              value={testAttemptsCount}
              delay={0.6}
            />
          </div>
        )}
      </div>
    </div>
  );
}
