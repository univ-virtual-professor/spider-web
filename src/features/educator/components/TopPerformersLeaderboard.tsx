import { useMemo, useState, useEffect } from "react";
import { Trophy, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@shared/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { Skeleton } from "@shared/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";

interface StudentDoc {
  id: string;
  name?: string;
  displayName?: string;
  fullName?: string;
  profile?: {
    photoURL?: string;
    avatar?: string;
  };
}

interface AttemptDoc {
  id: string;
  studentId?: string;
  studentName?: string;
  score?: number | string;
  maxScore?: number | string;
  testTitle?: string;
  createdAt?: any;
  submittedAt?: any;
}

interface TopPerformersLeaderboardProps {
  attempts: AttemptDoc[];
  students: StudentDoc[];
  isLoading: boolean;
  selectedBranchName: string;
  selectedCourseName: string;
}

export default function TopPerformersLeaderboard({
  attempts,
  students,
  isLoading,
  selectedBranchName,
  selectedCourseName,
}: TopPerformersLeaderboardProps) {
  const [activeTab, setActiveTab] = useState<"test" | "dpp">("test");
  const [displayCount, setDisplayCount] = useState<string>("all");
  const [selectedTestTitle, setSelectedTestTitle] = useState<string>("");

  // Helper to identify type
  const isDPP = (title: string) => {
    const t = title.toLowerCase();
    return t.includes("dpp") || t.includes("practice");
  };

  // Extract unique test titles based on type
  const testTitles = useMemo(() => {
    // Map titles to their latest attempt timestamp
    const titleToLatestTime: Record<string, number> = {};

    attempts.forEach((a) => {
      const title = a.testTitle || "Untitled Test";
      const isMatch = activeTab === "dpp" ? isDPP(title) : !isDPP(title);

      if (isMatch) {
        const time = a.submittedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
        if (!titleToLatestTime[title] || time > titleToLatestTime[title]) {
          titleToLatestTime[title] = time;
        }
      }
    });

    // Sort titles by the latest timestamp (descending)
    return Object.keys(titleToLatestTime).sort(
      (a, b) => titleToLatestTime[b] - titleToLatestTime[a]
    );
  }, [attempts, activeTab]);

  // Set default test title to the most recent one
  useEffect(() => {
    if (testTitles.length > 0 && !testTitles.includes(selectedTestTitle)) {
      // Find the most recent attempt for these titles
      const sortedByRecency = [...attempts]
        .filter((a) => testTitles.includes(a.testTitle || ""))
        .sort((a, b) => {
          const timeA = a.submittedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
          const timeB = b.submittedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
          return timeB - timeA;
        });

      if (sortedByRecency.length > 0) {
        setSelectedTestTitle(sortedByRecency[0].testTitle || "");
      } else {
        setSelectedTestTitle(testTitles[0]);
      }
    } else if (testTitles.length === 0) {
      setSelectedTestTitle("");
    }
  }, [testTitles, attempts]);

  // Find the absolute latest completed test (regardless of filters)
  const overallLatestTest = useMemo(() => {
    if (!attempts.length) return "";
    const sorted = [...attempts].sort((a, b) => {
      const timeA = a.submittedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
      const timeB = b.submittedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
      return timeB - timeA;
    });
    return sorted[0].testTitle || "";
  }, [attempts]);

  // Calculate Leaderboard Data
  const leaderboardData = useMemo(() => {
    if (!selectedTestTitle) return [];

    const studentMap: Record<
      string,
      {
        studentId: string;
        name: string;
        photo?: string;
        attempts: number;
        bestScore: number;
        totalScore: number;
        totalMaxScore: number;
      }
    > = {};

    attempts
      .filter((a) => a.testTitle === selectedTestTitle)
      .forEach((a) => {
        const stId = a.studentId;
        if (!stId) return;

        if (!studentMap[stId]) {
          const student = students.find((s) => s.id === stId);
          studentMap[stId] = {
            studentId: stId,
            name:
              student?.name ||
              student?.displayName ||
              student?.fullName ||
              a.studentName ||
              "Unknown Student",
            photo: student?.profile?.photoURL || student?.profile?.avatar,
            attempts: 0,
            bestScore: 0,
            totalScore: 0,
            totalMaxScore: 0,
          };
        }

        const score = Number(a.score || 0);
        const maxScore = Number(a.maxScore || 0);

        studentMap[stId].attempts += 1;
        studentMap[stId].bestScore = Math.max(studentMap[stId].bestScore, score);
        studentMap[stId].totalScore += score;
        studentMap[stId].totalMaxScore += maxScore;
      });

    const list = Object.values(studentMap).map((s) => ({
      ...s,
      accuracy: s.totalMaxScore > 0 ? (s.totalScore / s.totalMaxScore) * 100 : 0,
    }));

    // Sort by best score, then accuracy
    list.sort((a, b) => {
      if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
      return b.accuracy - a.accuracy;
    });

    // Apply count filter
    if (displayCount === "3") return list.slice(0, 3);
    if (displayCount === "5") return list.slice(0, 5);
    if (displayCount === "10") return list.slice(0, 10);
    return list;
  }, [attempts, students, selectedTestTitle, displayCount]);

  if (isLoading) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6">
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-dashed">
      <CardHeader className="flex flex-col justify-between gap-4 border-b bg-muted/20 pb-6 md:flex-row md:items-center">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-lg">Top Performers</CardTitle>
          </div>
          <CardDescription>
            Ranked by best score first, then average accuracy based on selected filters.
            {overallLatestTest && (
              <span className="mt-1 block font-medium text-primary">
                Latest completed test: {overallLatestTest}
              </span>
            )}
          </CardDescription>
        </div>
        <div className="flex w-full flex-col items-start gap-4 md:w-auto md:items-end">
          {/* Type Toggle - Always Visible */}
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "test" | "dpp")}
            className="w-full sm:w-auto"
          >
            <TabsList className="h-10 w-full border bg-background p-1 sm:w-auto">
              <TabsTrigger value="test" className="flex-1 px-6 text-xs sm:flex-none">
                Tests
              </TabsTrigger>
              <TabsTrigger value="dpp" className="flex-1 px-6 text-xs sm:flex-none">
                DPPs
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex w-full items-center gap-3 sm:w-auto">
            {/* Count Filter - Always Visible */}
            <Select value={displayCount} onValueChange={setDisplayCount}>
              <SelectTrigger className="h-9 flex-1 bg-background sm:w-[100px]">
                <SelectValue placeholder="Top Count" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Top 3</SelectItem>
                <SelectItem value="5">Top 5</SelectItem>
                <SelectItem value="10">Top 10</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>

            {/* Test Selector - Conditional Visibility */}
            {selectedBranchName !== "All" && selectedCourseName !== "All" && (
              <Select value={selectedTestTitle} onValueChange={setSelectedTestTitle}>
                <SelectTrigger className="h-9 flex-[2] bg-background sm:w-[200px]">
                  <SelectValue placeholder="Select Test" />
                </SelectTrigger>
                <SelectContent>
                  {testTitles.length === 0 ? (
                    <SelectItem value="none" disabled>
                      Create {activeTab === "test" ? "Test" : "DPP"} to see data
                    </SelectItem>
                  ) : (
                    testTitles.map((title) => (
                      <SelectItem key={title} value={title}>
                        {title}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/10 hover:bg-muted/10">
                <TableHead className="w-[80px] font-semibold">Rank</TableHead>
                <TableHead className="font-semibold">Learner</TableHead>
                <TableHead className="text-center font-semibold">Attempts</TableHead>
                <TableHead className="text-center font-semibold">Accuracy</TableHead>
                <TableHead className="text-right font-semibold">Best Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboardData.length > 0 ? (
                leaderboardData.map((row, index) => (
                  <TableRow
                    key={row.studentId}
                    className="group transition-colors hover:bg-muted/5"
                  >
                    <TableCell className="py-4 font-medium">
                      {index === 0 && <span className="font-bold text-amber-500">#1</span>}
                      {index === 1 && <span className="font-bold text-slate-400">#2</span>}
                      {index === 2 && <span className="font-bold text-orange-400">#3</span>}
                      {index > 2 && <span className="text-muted-foreground">#{index + 1}</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 border">
                          <AvatarImage src={row.photo} />
                          <AvatarFallback className="bg-primary/5 text-[10px]">
                            {row.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium transition-colors group-hover:text-primary">
                          {row.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {row.attempts}
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      <div className="flex items-center justify-center gap-1.5">
                        <TrendingUp className="h-3 w-3 text-green-500" />
                        {row.accuracy.toFixed(1)}%
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-base font-bold">
                      {row.bestScore.toFixed(1)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    {selectedBranchName === "All" || selectedCourseName === "All"
                      ? "Select a Branch and Program to view test rankings."
                      : testTitles.length === 0
                        ? `No ${activeTab === "test" ? "Tests" : "DPPs"} created yet for this selection.`
                        : selectedTestTitle
                          ? "No student scores available for this assessment."
                          : "Please select an assessment to view rankings."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
