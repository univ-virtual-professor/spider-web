// Shared "Analysis" screen (BUILD-NOTES.md §04: "Both: Analysis (per subject, per topic
// accuracy and error mix)") — used by the student's own /student/reports page and by the
// faculty "Student analysis" tab on a student's detail page. Matches the isAnalysis block in
// docs/agents/mockups/revamp/Desktop Portal.dc.html: KPI row, topic table, by-subject summary,
// "work on these first" with a practice action.
//
// monkey-king's report model (app/widgets/report_widget.py in the monkey-king repo) only ever
// returns topics that cross the weak (<50%) or strong (>75%) accuracy threshold, and has no
// per-topic "avg. time" / "last tested" fields and no per-question error-type breakdown. Per the
// ticket's own instruction ("omit a block rather than invent data"), this view does not render
// a "where marks are lost" block, an exhaustive "every topic tested" table, or an avg-time/
// last-tested column — none of that data exists yet.
import {
  DsCard,
  DsCardHeader,
  DsEmpty,
  DsInlineError,
  DsKpiRow,
  DsMeter,
  DsPageHeader,
  DsPermissionNotice,
  DsSkeletonRows,
  DsStatusPill,
  DsTableHead,
  DsTableRow,
} from "@shared/ui/ds";

export type AnalysisTrend = "improving" | "declining" | "stable" | "insufficient_data";

export type AnalysisTopic = {
  subject: string;
  chapter: string;
  topic: string;
  accuracy: number; // 0-1
  attempts: number;
  tone: "weak" | "strong";
};

export type AnalysisSubject = {
  subject: string;
  accuracy: number; // 0-1
  trend: AnalysisTrend;
  attempts: number;
};

export type AnalysisData = {
  status: "full" | "partial" | "no_data";
  totalAttempts: number;
  totalQuestionsAnalyzed: number;
  topics: AnalysisTopic[]; // weak + strong topics, weak first
  subjects: AnalysisSubject[];
};

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

const TREND_LABEL: Record<AnalysisTrend, string> = {
  improving: "Improving",
  declining: "Declining",
  stable: "Stable",
  insufficient_data: "—",
};

export function AnalysisView({
  title,
  subtitle,
  primaryAction,
  secondaryAction,
  loading,
  error,
  onRetry,
  permissionDenied,
  permissionBackHref,
  permissionMessage,
  data,
  onPracticeTopic,
  noDataHint,
}: {
  title?: string;
  subtitle?: string;
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  // BUILD-NOTES §03 "Permission": set when the caller's own scope excludes this record (e.g. a
  // batch-scoped faculty report endpoint 404s because the student isn't in one of their
  // batches) — shown via the shared DsPermissionNotice rather than an error.
  permissionDenied?: boolean;
  permissionBackHref?: string;
  permissionMessage?: string;
  data: AnalysisData | null;
  onPracticeTopic?: (topic: AnalysisTopic) => void;
  noDataHint: string;
}) {
  const header = title && (
    <DsPageHeader
      title={title}
      subtitle={subtitle}
      primary={
        primaryAction ? { label: primaryAction.label, onClick: primaryAction.onClick } : undefined
      }
      secondary={
        secondaryAction
          ? { label: secondaryAction.label, onClick: secondaryAction.onClick }
          : undefined
      }
    />
  );

  if (loading) {
    return (
      <div className="space-y-4 font-ds-sans">
        {header}
        <DsCard>
          <DsSkeletonRows rows={6} cols="1.8fr .7fr 1.1fr .8fr" />
        </DsCard>
      </div>
    );
  }

  if (permissionDenied) {
    return (
      <div className="space-y-4 font-ds-sans">
        {header}
        <DsPermissionNotice backHref={permissionBackHref} message={permissionMessage} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 font-ds-sans">
        {header}
        <DsInlineError message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (!data || data.status === "no_data") {
    return (
      <div className="space-y-4 font-ds-sans">
        {header}
        <DsCard>
          <DsEmpty title="No analysis yet" body={noDataHint} />
        </DsCard>
      </div>
    );
  }

  const weakTopics = data.topics.filter((t) => t.tone === "weak");
  const strongTopics = data.topics.filter((t) => t.tone === "strong");
  const workOnThese = [...weakTopics]
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts)
    .slice(0, 4);

  return (
    <div className="space-y-4 font-ds-sans">
      {header}

      {data.status === "partial" && (
        <div className="rounded-[10px] border border-ds-info/25 bg-ds-info/[.08] px-4 py-2.5 font-ds-sans text-[12px] text-ds-info">
          Based on {data.totalAttempts} test{data.totalAttempts === 1 ? "" : "s"} so far — the
          picture gets sharper with more attempts.
        </div>
      )}

      <DsKpiRow
        items={[
          { label: "Tests taken", value: String(data.totalAttempts), tone: "slate" },
          {
            label: "Questions analysed",
            value: String(data.totalQuestionsAnalyzed),
            tone: "info",
          },
          { label: "Weak topics", value: String(weakTopics.length), tone: "accent" },
          { label: "Strong topics", value: String(strongTopics.length), tone: "positive" },
        ]}
      />

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.6fr_1fr]">
        <DsCard className="overflow-hidden">
          <DsCardHeader
            title="Topics"
            meta={`${data.topics.length} flagged${data.topics.length === 1 ? "" : "s"}`}
          />
          {data.topics.length === 0 ? (
            <DsEmpty
              title="Nothing flagged yet"
              body="No topic has crossed the weak (<50%) or strong (>75%) accuracy threshold yet."
            />
          ) : (
            <>
              <DsTableHead
                columns={["Topic", "Attempted", "Accuracy", "Status"]}
                cols="1.8fr .7fr 1.1fr .8fr"
              />
              {data.topics.map((t, i) => (
                <DsTableRow key={`${t.subject}-${t.topic}-${i}`} cols="1.8fr .7fr 1.1fr .8fr">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">
                      {t.topic || t.chapter || t.subject}
                    </div>
                    <div className="truncate font-ds-sans text-[11px] text-ds-ink/45">
                      {[t.subject, t.chapter].filter(Boolean).join(" › ")}
                    </div>
                  </div>
                  <div className="font-ds-mono text-[12px] text-ds-ink/60">{t.attempts}</div>
                  <div className="pr-4">
                    <DsMeter
                      pct={t.accuracy * 100}
                      tone={t.tone === "weak" ? "accent" : "positive"}
                    />
                  </div>
                  <div className="flex justify-end">
                    <DsStatusPill tone={t.tone === "weak" ? "accent" : "positive"}>
                      {t.tone === "weak" ? "Needs work" : "Strong"}
                    </DsStatusPill>
                  </div>
                </DsTableRow>
              ))}
            </>
          )}
        </DsCard>

        <div className="flex flex-col gap-3.5">
          <DsCard className="p-4">
            <div className="mb-3 font-ds-sans text-[13.5px] font-semibold text-ds-ink">
              By subject
            </div>
            {data.subjects.length === 0 ? (
              <p className="font-ds-sans text-[12px] text-ds-ink/45">
                Not enough tests yet to break this down by subject.
              </p>
            ) : (
              data.subjects.map((s) => (
                <div key={s.subject} className="mb-3 last:mb-0">
                  <div className="flex items-baseline gap-2">
                    <div className="font-ds-sans text-[12.5px] font-medium text-ds-ink">
                      {s.subject}
                    </div>
                    <div className="flex-1" />
                    <div className="font-ds-mono text-[11px] text-ds-ink/45">
                      {TREND_LABEL[s.trend]}
                    </div>
                  </div>
                  <div className="mt-1.5">
                    <DsMeter
                      pct={s.accuracy * 100}
                      tone={s.trend === "declining" ? "accent" : "info"}
                    />
                  </div>
                </div>
              ))
            )}
          </DsCard>

          <DsCard className="flex-1 p-4">
            <div className="mb-1 font-ds-sans text-[13.5px] font-semibold text-ds-ink">
              Work on these first
            </div>
            <p className="mb-2.5 font-ds-sans text-[11.5px] leading-[1.5] text-ds-ink/50">
              The lowest-accuracy topics flagged so far.
            </p>
            {workOnThese.length === 0 ? (
              <p className="font-ds-sans text-[12px] text-ds-ink/45">
                Nothing below 50% accuracy right now.
              </p>
            ) : (
              workOnThese.map((t, i) => (
                <div
                  key={`${t.subject}-${t.topic}-${i}`}
                  className="flex items-center gap-2.5 border-b border-ds-ink/[.055] py-2 last:border-0"
                >
                  <div className="w-5 font-ds-mono text-[12px] font-semibold text-ds-ink/35">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-ds-sans text-[12.5px] font-medium text-ds-ink">
                      {t.topic || t.chapter || t.subject}
                    </div>
                    <div className="truncate font-ds-sans text-[11px] text-ds-ink/45">
                      {pct(t.accuracy)} accuracy over {t.attempts} attempt
                      {t.attempts === 1 ? "" : "s"}
                    </div>
                  </div>
                  {onPracticeTopic && (
                    <button
                      onClick={() => onPracticeTopic(t)}
                      className="h-7 shrink-0 rounded-md bg-ds-fill px-2.5 font-ds-sans text-[11px] font-semibold text-ds-ink hover:bg-ds-ink/10"
                    >
                      Practice
                    </button>
                  )}
                </div>
              ))
            )}
          </DsCard>
        </div>
      </div>
    </div>
  );
}

export function topicsToCsv(data: AnalysisData): string {
  const header = "Subject,Chapter,Topic,Attempted,Accuracy,Status";
  const rows = data.topics.map((t) =>
    [
      t.subject,
      t.chapter,
      t.topic,
      String(t.attempts),
      pct(t.accuracy),
      t.tone === "weak" ? "Needs work" : "Strong",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header, ...rows].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
