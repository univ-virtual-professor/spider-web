import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuth } from "@app/providers/AuthProvider";
import {
  AnalysisView,
  downloadCsv,
  topicsToCsv,
  type AnalysisData,
  type AnalysisTopic,
} from "@shared/components/analysis/AnalysisView";

const API_BASE = import.meta.env.VITE_MONKEY_KING_API_URL as string;

// ─── monkey-king's report shape (GET /api/reports/my) ──────────────────────

type WeakArea = {
  subject: string;
  chapter: string;
  topic: string;
  weighted_accuracy: number;
  attempt_count: number;
};

type SubjectBreakdown = {
  subject: string;
  weighted_accuracy: number;
  trend: string;
  attempt_count: number;
};

type Report = {
  status: "full" | "partial" | "no_data";
  computed_at: string | null;
  is_stale: boolean;
  weak_areas_full: WeakArea[];
  strong_holds_full: WeakArea[];
  subject_breakdown: SubjectBreakdown[];
  total_attempts: number;
  total_questions_analyzed: number;
};

async function fetchReport(token: string): Promise<Report> {
  const res = await fetch(`${API_BASE}/api/reports/my`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to load report (${res.status})`);
  return res.json();
}

async function triggerRecompute(token: string): Promise<{ accepted: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/reports/recompute`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Recompute failed (${res.status})`);
  return res.json();
}

function toAnalysisData(report: Report): AnalysisData {
  const topics: AnalysisTopic[] = [
    ...report.weak_areas_full.map((w) => ({
      subject: w.subject,
      chapter: w.chapter,
      topic: w.topic,
      accuracy: w.weighted_accuracy,
      attempts: w.attempt_count,
      tone: "weak" as const,
    })),
    ...report.strong_holds_full.map((s) => ({
      subject: s.subject,
      chapter: s.chapter,
      topic: s.topic,
      accuracy: s.weighted_accuracy,
      attempts: s.attempt_count,
      tone: "strong" as const,
    })),
  ];

  return {
    status: report.status,
    totalAttempts: report.total_attempts,
    totalQuestionsAnalyzed: report.total_questions_analyzed,
    topics,
    subjects: report.subject_breakdown.map((s) => ({
      subject: s.subject,
      accuracy: s.weighted_accuracy,
      trend: s.trend as AnalysisData["subjects"][number]["trend"],
      attempts: s.attempt_count,
    })),
  };
}

export default function StudentReports() {
  const { firebaseUser } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: report,
    isLoading,
    isError,
    refetch,
  } = useQuery<Report>({
    queryKey: ["studentReport", firebaseUser?.uid],
    queryFn: async () => {
      const token = await firebaseUser?.getIdToken();
      if (!token) throw new Error("Not authenticated");
      return fetchReport(token);
    },
    enabled: !!firebaseUser,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const recomputeMutation = useMutation({
    mutationFn: async () => {
      const token = await firebaseUser?.getIdToken();
      if (!token) throw new Error("Not authenticated");
      return triggerRecompute(token);
    },
    onSuccess: (data) => {
      if (data.accepted) {
        toast.success("Report is updating. Refresh in ~30 seconds.");
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["studentReport"] });
        }, 30_000);
      } else {
        toast.info(data.message);
      }
      setRefreshing(false);
    },
    onError: () => {
      toast.error("Failed to trigger report update.");
      setRefreshing(false);
    },
  });

  const data = useMemo(() => (report ? toAnalysisData(report) : null), [report]);

  const handlePracticeTopic = (topic: AnalysisTopic) => {
    navigate("/student/practice", {
      state: {
        subject: topic.subject,
        chapter: topic.chapter || undefined,
        topic: topic.topic || undefined,
      },
    });
  };

  const handleExport = () => {
    if (!data) return;
    downloadCsv("analysis.csv", topicsToCsv(data));
  };

  const handleRefresh = () => {
    setRefreshing(true);
    recomputeMutation.mutate();
  };

  return (
    <div className="space-y-3">
      <AnalysisView
        title="Analysis"
        subtitle="Every topic you have been tested on, subject by subject."
        primaryAction={{
          label: "Practice weak topics",
          onClick: () => navigate("/student/practice"),
        }}
        secondaryAction={{ label: "Export", onClick: handleExport }}
        loading={isLoading}
        error={isError ? "Could not load your report." : null}
        onRetry={() => refetch()}
        data={data}
        onPracticeTopic={handlePracticeTopic}
        noDataHint="Take your first DPP or test to unlock your performance analysis."
      />
      <div className="flex justify-end">
        <button
          onClick={handleRefresh}
          disabled={refreshing || recomputeMutation.isPending}
          className="font-ds-sans text-[11.5px] font-medium text-ds-ink/45 hover:text-ds-ink disabled:opacity-50"
        >
          {refreshing || recomputeMutation.isPending ? "Updating…" : "Refresh analysis"}
        </button>
      </div>
    </div>
  );
}
