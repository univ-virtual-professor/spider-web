import { HtmlView } from "@shared/lib/safeHtml";
import { cn } from "@shared/lib/utils";
import { DsCard } from "@shared/ui/ds";
import { QuestionElapsedTimer } from "./QuestionElapsedTimer";
import { usePracticeHistory } from "@features/student/practice/usePracticeHistory";

export type PracticeQuestion = {
  id: string;
  type: "mcq" | "integer" | "short_answer" | "fill_up";
  stem: string;
  options?: { id: string; text: string }[];
  explanation?: string;
  topic?: string;
  chapter?: string;
  difficulty?: string;
};

type Props = {
  testTitle: string;
  generatedNote?: string;
  totalQuestions: number;
  currentIndex: number;
  question: PracticeQuestion;
  isAnswered: boolean;
  isStarted: boolean;
  selectedAnswer: string | null;
  onSelectOption: (value: string) => void;
  onSubmitAnswer: () => void;
  onSkip: () => void;
  onJumpTo: (index: number) => void;
  dotStatuses: ("current" | "answered" | "pending")[];
  runningScore: { correct: number; incorrect: number };
  topicAllocation: { label: string; count: number }[];
  studentId?: string;
  educatorId?: string;
  attemptId: string | null;
};

const TYPE_LABEL: Record<PracticeQuestion["type"], string> = {
  mcq: "MCQ",
  integer: "NUMERIC",
  fill_up: "FILL IN THE BLANK",
  short_answer: "SUBJECTIVE",
};

export function PracticePlayerView({
  testTitle,
  generatedNote,
  totalQuestions,
  currentIndex,
  question,
  isAnswered,
  isStarted,
  selectedAnswer,
  onSelectOption,
  onSubmitAnswer,
  onSkip,
  onJumpTo,
  dotStatuses,
  runningScore,
  topicAllocation,
  studentId,
  educatorId,
  attemptId,
}: Props) {
  const history = usePracticeHistory(studentId, educatorId, attemptId);

  return (
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.5fr_1fr]">
      <DsCard className="overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-ds-ink/[.08] px-4 py-3">
          <div className="font-ds-sans text-[13.5px] font-semibold text-ds-ink">
            Question {currentIndex + 1} of {totalQuestions}
          </div>
          {(question.topic || question.chapter) && (
            <span className="rounded-[5px] bg-ds-accent/15 px-[7px] py-0.5 font-ds-mono text-[10.5px] font-semibold uppercase tracking-wide text-ds-accent">
              {question.topic || question.chapter}
            </span>
          )}
          <div className="flex-1" />
          <QuestionElapsedTimer questionKey={question.id} />
        </div>

        <div className="px-[22px] py-5">
          <div className="max-w-[620px] font-ds-sans text-[14.5px] leading-[1.7] text-ds-ink">
            <HtmlView html={question.stem} />
          </div>

          <div className="mb-[18px] mt-3.5 flex flex-wrap gap-1.5">
            <span className="rounded-md bg-ds-fill px-[9px] py-1 font-ds-mono text-[11px] font-medium text-ds-ink/60">
              {TYPE_LABEL[question.type]}
            </span>
            {question.difficulty && (
              <span className="rounded-md bg-ds-fill px-[9px] py-1 font-ds-mono text-[11px] font-medium text-ds-ink/60">
                {question.difficulty.toUpperCase()}
              </span>
            )}
          </div>

          <div className="rounded-[9px] border border-ds-ink/[.12] bg-ds-canvas/60 p-3.5">
            {question.type === "mcq" && question.options && (
              <div className="flex flex-col gap-1">
                {question.options.map((option, i) => {
                  const isSelected = selectedAnswer === option.id;
                  return (
                    <label
                      key={option.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-[5px] border px-2.5 py-2",
                        isSelected ? "border-ds-accent/40 bg-ds-accent/[.08]" : "border-transparent"
                      )}
                    >
                      <input
                        type="radio"
                        name={`practice_q_${question.id}`}
                        value={option.id}
                        checked={isSelected}
                        disabled={!isStarted || isAnswered}
                        onChange={() => onSelectOption(option.id)}
                        className="mt-[3px]"
                      />
                      <span className="font-ds-sans text-[13px] leading-[1.6] text-ds-ink">
                        <span className="mr-1 font-semibold">{String.fromCharCode(65 + i)}.</span>
                        <HtmlView html={option.text} className="inline" />
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {question.type === "integer" && (
              <input
                type="number"
                placeholder="Enter your answer"
                value={selectedAnswer || ""}
                onChange={(e) => onSelectOption(e.target.value)}
                disabled={!isStarted || isAnswered}
                className="w-48 rounded-[7px] border border-ds-ink/15 px-3 py-2 font-ds-sans text-[13px] outline-none"
              />
            )}

            {(question.type === "fill_up" || question.type === "short_answer") && (
              <textarea
                placeholder="Type your answer"
                value={selectedAnswer || ""}
                onChange={(e) => onSelectOption(e.target.value)}
                disabled={!isStarted || isAnswered}
                rows={question.type === "short_answer" ? 4 : 1}
                className="w-full rounded-[7px] border border-ds-ink/15 px-3 py-2 font-ds-sans text-[13px] outline-none"
              />
            )}
          </div>

          <div className="mt-3.5 flex items-center gap-2.5">
            <button
              onClick={onSubmitAnswer}
              disabled={!isStarted || isAnswered}
              className="h-9 rounded-[8px] bg-ds-accent px-4 font-ds-sans text-[12.5px] font-semibold text-white disabled:opacity-50"
            >
              Submit answer
            </button>
            <button
              onClick={onSkip}
              disabled={!isStarted || currentIndex >= totalQuestions - 1}
              className="h-9 rounded-[8px] border border-ds-ink/15 px-3.5 font-ds-sans text-[12.5px] font-medium text-ds-ink disabled:opacity-50"
            >
              Skip
            </button>
            <div className="flex-1" />
            {isAnswered && question.explanation && (
              <details className="text-right">
                <summary className="cursor-pointer font-ds-sans text-[12px] font-medium text-ds-accent">
                  See worked solution
                </summary>
              </details>
            )}
          </div>
          {isAnswered && question.explanation && (
            <div className="mt-2 rounded-[7px] bg-ds-fill p-3 font-ds-sans text-[12.5px] leading-[1.6] text-ds-ink/75">
              <HtmlView html={question.explanation} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-[5px] border-t border-ds-ink/[.07] bg-ds-canvas px-4 py-3">
          {dotStatuses.map((status, i) => (
            <button
              key={i}
              onClick={() => onJumpTo(i)}
              className={cn(
                "flex h-[22px] w-[22px] items-center justify-center rounded-[6px] border font-ds-mono text-[10.5px] font-semibold",
                status === "current"
                  ? "border-ds-ink bg-ds-ink text-white"
                  : status === "answered"
                    ? "border-ds-positive/30 bg-ds-positive/15 text-ds-positive"
                    : "border-ds-ink/10 text-ds-ink/40"
              )}
            >
              {i + 1}
            </button>
          ))}
          <div className="flex-1" />
          {(runningScore.correct > 0 || runningScore.incorrect > 0) && (
            <div className="font-ds-mono text-[11.5px] text-ds-ink/45">
              {runningScore.correct} correct · {runningScore.incorrect} wrong
            </div>
          )}
        </div>
      </DsCard>

      <div className="flex flex-col gap-3.5">
        <DsCard className="p-3.5">
          <div className="mb-1 font-ds-sans text-[13.5px] font-semibold text-ds-ink">
            Why these questions
          </div>
          <div className="font-ds-sans text-[11.5px] leading-[1.55] text-ds-ink/50">
            {generatedNote || `${testTitle} — what's in today's set.`}
          </div>
          {topicAllocation.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {topicAllocation.map((t) => (
                <span
                  key={t.label}
                  className="rounded-md bg-ds-accent/15 px-[9px] py-1 font-ds-sans text-[11px] font-medium text-ds-accent"
                >
                  {t.label} · {t.count}
                </span>
              ))}
            </div>
          )}
        </DsCard>

        <DsCard className="p-3.5">
          <div className="mb-3 flex items-center">
            <div className="font-ds-sans text-[13.5px] font-semibold text-ds-ink">This week</div>
            <div className="flex-1" />
            {!history.loading && !history.error && history.dayStreak > 0 && (
              <div className="font-ds-mono text-[11px] text-ds-accent">
                {history.dayStreak} DAY STREAK
              </div>
            )}
          </div>
          {history.loading ? (
            <div className="font-ds-sans text-[11.5px] text-ds-ink/40">Loading…</div>
          ) : history.error ? (
            <div className="font-ds-sans text-[11.5px] text-ds-ink/40">
              Couldn't load your streak.
            </div>
          ) : history.dayStreak === 0 && history.pastSets.length === 0 ? (
            <div className="font-ds-sans text-[11.5px] text-ds-ink/40">
              Complete today's set to start a streak.
            </div>
          ) : null}
        </DsCard>

        <DsCard className="flex-1 p-3.5">
          <div className="mb-2.5 font-ds-sans text-[13.5px] font-semibold text-ds-ink">
            Past sets
          </div>
          {history.loading ? (
            <div className="font-ds-sans text-[11.5px] text-ds-ink/40">Loading…</div>
          ) : history.pastSets.length === 0 ? (
            <div className="font-ds-sans text-[11.5px] text-ds-ink/40">
              No past practice sets yet.
            </div>
          ) : (
            history.pastSets.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2.5 border-b border-ds-ink/[.055] py-2 last:border-b-0"
              >
                <div>
                  <div className="font-ds-sans text-[12.5px] font-medium text-ds-ink">
                    {p.dateLabel}
                  </div>
                  <div className="font-ds-sans text-[11px] text-ds-ink/45">{p.title}</div>
                </div>
                <div className="flex-1" />
                <div className="font-ds-mono text-[12px] font-semibold text-ds-ink/70">
                  {p.score}/{p.maxScore}
                </div>
              </div>
            ))
          )}
        </DsCard>
      </div>
    </div>
  );
}
