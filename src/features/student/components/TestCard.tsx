import { useEffect, useState } from "react";
import { Clock, FileText, Lock, Unlock, Play, Timer, CalendarClock } from "lucide-react";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { cn } from "@shared/lib/utils";
import { Test } from "@features/student/types";
import { useTenant } from "@app/providers/TenantProvider";

interface TestCardProps {
  test: Test & { isLive?: boolean; isUpcoming?: boolean; startsAtMs?: number };
  attemptsUsed?: number;
  onStart: (testId: string) => void;
  onUnlock: (testId: string) => void;
}

const difficultyColors = {
  Easy: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  Hard: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const subjectColors: Record<string, string> = {
  "General Test": "bg-pastel-mint",
  English: "bg-pastel-lavender",
  Mathematics: "bg-pastel-yellow",
  Physics: "bg-pastel-peach",
  Chemistry: "bg-pastel-pink",
  Biology: "bg-pastel-cream",
};

const subjectStyles: Record<string, string> = {
  "General Test":
    "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400",
  English:
    "bg-violet-500/10 text-violet-700 border-violet-500/20 dark:bg-violet-500/20 dark:text-violet-400",
  Mathematics:
    "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400",
  Physics:
    "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-400",
  Chemistry:
    "bg-pink-500/10 text-pink-700 border-pink-500/20 dark:bg-pink-500/20 dark:text-pink-400",
  Biology: "bg-rose-500/10 text-rose-700 border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-400",
};

const getSubjectBadgeStyle = (subject: string) => {
  return (
    subjectStyles[subject] ||
    "bg-primary/10 text-primary border-primary/20 dark:bg-primary/20 dark:text-primary-foreground"
  );
};

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return "Expired";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m ${s}s left`;
  return `${s}s left`;
}

function toMillis(v: any): number {
  if (!v) return Date.now();
  if (typeof v === "number") return v;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return Date.now();
}
function formatCountdown(ms: number): string {
  if (ms <= 0) return "Starting now";
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function timeAgo(createdAt: string) {
  const now = toMillis(new Date());
  const created = toMillis(createdAt);
  const diffMs = now - created;

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }

  if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  }

  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  }

  return "Just now";
}

function safeNum(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function TestCard({ test, attemptsUsed = 0, onStart, onUnlock }: TestCardProps) {
  const { tenant } = useTenant();

  const windowExpiresAt = (test as any).windowExpiresAt as number | null | undefined;
  const [timeLeft, setTimeLeft] = useState<number | null>(
    windowExpiresAt ? Math.max(0, windowExpiresAt - Date.now()) : null
  );
  const [countdown, setCountdown] = useState<number | null>(
    test.startsAtMs ? Math.max(0, test.startsAtMs - Date.now()) : null
  );

  useEffect(() => {
    if (!windowExpiresAt) return;
    const tick = () => setTimeLeft(Math.max(0, windowExpiresAt - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [windowExpiresAt]);

  useEffect(() => {
    if (!test.startsAtMs) return;
    const tick = () => setCountdown(Math.max(0, test.startsAtMs! - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [test.startsAtMs]);

  // Firestore docs may miss attempts fields on some tests; use safe defaults.
  const attemptsAllowed = Math.max(
    1,
    safeNum(
      (test as any).attemptsAllowed ?? (test as any).maxAttempts,
      tenant?.testDefaults?.attemptsAllowed ?? 3
    )
  );
  const attemptsUsedSafe = Math.max(0, safeNum(attemptsUsed, 0));
  const attemptsRemaining = Math.max(0, attemptsAllowed - attemptsUsedSafe);

  const rawDifficulty = test.difficulty || test.level || "Medium";
  const difficultyLabel =
    typeof rawDifficulty === "string"
      ? rawDifficulty.charAt(0).toUpperCase() + rawDifficulty.slice(1).toLowerCase()
      : "Medium";
  const diffColor =
    difficultyColors[difficultyLabel as keyof typeof difficultyColors] || difficultyColors.Medium;

  return (
    <>
      {/* Desktop Card View (Big Screen Only) */}
      <div
        className={cn(
          "hidden flex-row items-center justify-between gap-3 rounded-lg border border-border/80 bg-card px-3 py-2.5 shadow-sm transition-all duration-200 hover:bg-muted/10 md:flex",
          test.isLive
            ? "border-red-200 bg-red-50/30 dark:border-red-900/30 dark:bg-red-900/10"
            : test.isUpcoming
              ? "border-amber-200 bg-amber-50/30 dark:border-amber-900/30 dark:bg-amber-900/10"
              : ""
        )}
      >
        {/* Left Column: Icon + Subject/Title */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-bold shadow-sm",
              test.isLive
                ? "bg-red-500/10 text-red-500"
                : test.isUpcoming
                  ? "bg-amber-500/10 text-amber-500"
                  : subjectColors[test.subject] || "bg-pastel-cream text-foreground"
            )}
          >
            {test.isLocked ? (
              <Lock className="h-5 w-5 text-destructive" />
            ) : (
              <Unlock className="h-5 w-5 text-green-600" />
            )}
          </div>

          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold leading-snug text-foreground sm:text-base">
                {test.title}
              </h3>
              {test.isLive && (
                <Badge
                  variant="destructive"
                  className="h-4 animate-pulse px-1.5 py-0 text-[9px] font-bold tracking-wider"
                >
                  LIVE
                </Badge>
              )}
              {test.isUpcoming && (
                <Badge className="h-4 bg-amber-500 px-1.5 py-0 text-[9px] font-bold tracking-wider text-white hover:bg-amber-500">
                  UPCOMING
                </Badge>
              )}
            </div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {test.subject}
            </p>
          </div>
        </div>

        {/* Middle Column: Stats & Attempts */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 md:min-w-[220px]">
          {/* Stats Badges */}
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium"
            >
              {timeAgo(test.createdAt)}
            </Badge>
            <Badge
              variant="secondary"
              className="rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium"
            >
              <Clock className="mr-1 h-3 w-3 text-muted-foreground" />
              {test.durationMinutes} min
            </Badge>
            <Badge
              variant="secondary"
              className="rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium"
            >
              <FileText className="mr-1 h-3 w-3 text-muted-foreground" />
              {test.questionsCount} Q
            </Badge>
            <Badge
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                diffColor
              )}
            >
              {difficultyLabel}
            </Badge>
          </div>
        </div>

        {/* Right Column: Timing/Countdown & Actions */}
        <div className="flex min-w-[220px] shrink-0 items-center justify-end gap-4">
          {/* Timing Information */}
          <div className="flex shrink-0 flex-col text-right text-xs">
            {!test.isLocked && timeLeft !== null && (
              <div
                className={cn(
                  "flex items-center gap-1 font-semibold",
                  timeLeft < 5 * 60 * 1000 ? "animate-pulse text-red-600" : "text-amber-600"
                )}
              >
                <Timer className="h-3.5 w-3.5" />
                {formatTimeLeft(timeLeft)}
              </div>
            )}

            {test.isUpcoming && countdown !== null && (
              <div className="flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
                <CalendarClock className="h-3.5 w-3.5" />
                Starting in {formatCountdown(countdown)}
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex shrink-0 items-center gap-2">
            {test.isUpcoming ? (
              <Button
                size="sm"
                className="h-8 rounded-lg bg-amber-500 px-3 text-xs font-medium text-white hover:bg-amber-600"
                disabled
              >
                <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                {countdown !== null && countdown > 0 ? `In ${formatCountdown(countdown)}` : "Soon"}
              </Button>
            ) : test.isLocked ? (
              <Button
                size="sm"
                className="gradient-bg h-9 rounded-lg px-4 text-xs font-semibold"
                onClick={() => onUnlock(test.id)}
              >
                <Lock className="mr-1.5 h-3.5 w-3.5" />
                Unlock
              </Button>
            ) : (
              <Button
                size="sm"
                className="gradient-bg h-9 rounded-lg px-4 text-xs font-semibold"
                onClick={() => onStart(test.id)}
                disabled={attemptsRemaining <= 0}
              >
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Start
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Card View (Small Screen Only) */}
      <div
        className={cn(
          "group relative flex flex-col justify-between gap-4 rounded-2xl border border-border/80 bg-card p-5 shadow-sm transition-all duration-300 hover:border-primary/20 hover:shadow-md md:hidden",
          test.isLive
            ? "border-red-200 bg-red-50/10 dark:border-red-950/20 dark:bg-red-950/10"
            : test.isUpcoming
              ? "border-amber-200 bg-amber-50/10 dark:border-amber-950/20 dark:bg-amber-950/10"
              : "hover:bg-muted/5"
        )}
      >
        {/* Content Block: Icon + Title & Badges */}
        <div className="flex min-w-0 flex-1 items-start gap-4">
          {/* Status Icon Badge */}
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border font-bold shadow-sm transition-transform duration-300 group-hover:scale-105",
              test.isLive
                ? "animate-pulse border-red-600 bg-red-500 text-white"
                : test.isUpcoming
                  ? "border-amber-200/50 bg-amber-50 text-amber-500 dark:border-amber-900/30 dark:bg-amber-950/20"
                  : test.isLocked
                    ? "border-red-100 bg-red-50 text-red-500 dark:border-red-900/30 dark:bg-red-950/20"
                    : "border-emerald-100 bg-emerald-50 text-emerald-600 dark:border-emerald-900/30 dark:bg-emerald-950/20"
            )}
          >
            {test.isLive ? (
              <Play className="h-5 w-5 animate-pulse fill-current" />
            ) : test.isLocked ? (
              <Lock className="h-5 w-5" />
            ) : (
              <Unlock className="h-5 w-5" />
            )}
          </div>

          {/* Title and Metadata */}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold leading-tight tracking-tight text-foreground transition-colors duration-200 group-hover:text-violet-600 dark:group-hover:text-violet-400 sm:text-base">
                {test.title}
              </h3>
              {test.isLive && (
                <Badge
                  variant="destructive"
                  className="h-4.5 animate-pulse rounded-md px-1.5 py-0 text-[9px] font-bold tracking-wider"
                >
                  LIVE
                </Badge>
              )}
              {test.isUpcoming && (
                <Badge className="h-4.5 rounded-md bg-amber-500 px-1.5 py-0 text-[9px] font-bold tracking-wider text-white hover:bg-amber-500">
                  UPCOMING
                </Badge>
              )}
            </div>

            {/* Badges/Pills Row */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Subject Tag */}

              {/* Created At Pill */}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/20 px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40">
                {timeAgo(test.createdAt)}
              </span>

              {/* Duration Pill */}
              <span className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-muted/20 px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40">
                <Clock className="h-3 w-3 text-muted-foreground/80" />
                {test.durationMinutes} min
              </span>

              {/* Questions Pill */}
              <span className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-muted/20 px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40">
                <FileText className="h-3 w-3 text-muted-foreground/80" />
                {test.questionsCount} Q
              </span>

              {/* Difficulty Pill */}
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  difficultyLabel === "Easy"
                    ? "border-emerald-200/50 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400"
                    : difficultyLabel === "Hard"
                      ? "border-rose-200/50 bg-rose-50 text-rose-700 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-400"
                      : "border-amber-200/50 bg-amber-50 text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-400"
                )}
              >
                {difficultyLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Timing/Countdown & Actions */}
        <div className="flex shrink-0 flex-col items-stretch gap-3 border-t border-border/40 pt-4">
          {/* Timing Information */}
          {(timeLeft !== null || countdown !== null) && (
            <div className="flex flex-row items-center justify-between gap-1 text-xs">
              <span className="text-muted-foreground">Status:</span>
              {!test.isLocked && timeLeft !== null && (
                <div
                  className={cn(
                    "flex items-center gap-1 font-semibold",
                    timeLeft < 5 * 60 * 1000
                      ? "animate-pulse text-red-600"
                      : "text-amber-600 dark:text-amber-400"
                  )}
                >
                  <Timer className="h-3.5 w-3.5" />
                  {formatTimeLeft(timeLeft)}
                </div>
              )}

              {test.isUpcoming && countdown !== null && (
                <div className="flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Starting in {formatCountdown(countdown)}
                </div>
              )}
            </div>
          )}

          {/* Action Button & Attempts */}
          <div className="flex flex-col items-stretch gap-1.5 sm:flex-row sm:items-center">
            {/* Attempts counter */}
            {!test.isLocked && !test.isUpcoming && (
              <span className="text-center text-xs text-muted-foreground sm:text-left">
                {attemptsRemaining === 0 ? (
                  <span className="font-medium text-destructive">No attempts remaining</span>
                ) : (
                  <span>
                    {attemptsRemaining} of {attemptsAllowed}{" "}
                    {attemptsAllowed === 1 ? "attempt" : "attempts"} left
                  </span>
                )}
              </span>
            )}

            {/* Buttons */}
            <div className="flex items-center justify-stretch sm:justify-end">
              {test.isUpcoming ? (
                <Button
                  size="sm"
                  className="h-9 w-full cursor-not-allowed rounded-xl border border-border bg-muted px-4 text-xs font-medium text-muted-foreground sm:w-auto"
                  disabled
                >
                  <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                  {countdown !== null && countdown > 0
                    ? `In ${formatCountdown(countdown)}`
                    : "Soon"}
                </Button>
              ) : test.isLocked ? (
                <Button
                  size="sm"
                  className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-violet-700 hover:shadow-violet-500/20 active:scale-[0.98] sm:w-auto"
                  onClick={() => onUnlock(test.id)}
                >
                  <Lock className="h-3.5 w-3.5" />
                  Unlock
                </Button>
              ) : (
                <Button
                  size="sm"
                  className={cn(
                    "flex h-9 w-full items-center justify-center gap-1.5 rounded-xl px-5 text-xs font-semibold text-white shadow-sm transition-all active:scale-[0.98] sm:w-auto",
                    attemptsRemaining <= 0
                      ? "cursor-not-allowed border border-border bg-muted text-muted-foreground hover:bg-muted"
                      : "bg-violet-600 hover:bg-violet-700 hover:shadow-violet-500/20"
                  )}
                  onClick={() => onStart(test.id)}
                  disabled={attemptsRemaining <= 0}
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Start Test
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
