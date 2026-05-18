import { useEffect, useState } from "react";
import { Clock, FileText, Lock, Unlock, Play, Eye, Timer, CalendarClock } from "lucide-react";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { cn } from "@shared/lib/utils";
import { Test } from "@features/student/types";
import { useTenant } from "@app/providers/TenantProvider";

interface TestCardProps {
  test: Test & { isLive?: boolean; isUpcoming?: boolean; startsAtMs?: number };
  attemptsUsed?: number;
  onView: (testId: string) => void;
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

function safeNum(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function TestCard({ test, attemptsUsed = 0, onView, onStart, onUnlock }: TestCardProps) {
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
    <div
      className={cn(
        "flex flex-col justify-between gap-4 rounded-xl border border-border/80 bg-card p-4 shadow-sm transition-all duration-200 hover:bg-muted/10 md:flex-row md:items-center",
        test.isLive
          ? "border-red-200 bg-red-50/30 dark:border-red-900/30 dark:bg-red-900/10"
          : test.isUpcoming
            ? "border-amber-200 bg-amber-50/30 dark:border-amber-900/30 dark:bg-amber-900/10"
            : ""
      )}
    >
      {/* Left Column: Icon + Subject/Title */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-bold shadow-sm transition-transform",
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
      <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 md:min-w-[280px]">
        {/* Stats Badges */}
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium"
          >
            <Clock className="mr-1 h-3 w-3 text-muted-foreground" />
            {test.duration} min
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

        {/* Attempts / Price */}
        <div className="flex flex-col text-xs text-muted-foreground">
          {!test.isLocked &&
            (attemptsRemaining > 0 ? (
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {attemptsRemaining} attempt{attemptsRemaining > 1 ? "s" : ""} left
              </span>
            ) : (
              <span className="font-semibold text-destructive">No attempts left</span>
            ))}
          {test.isLocked && test.price > 0 && !test.isLive && (
            <span className="text-sm font-bold text-primary">₹{test.price}</span>
          )}
          {test.isLive && (
            <span className="text-[10px] font-bold uppercase text-red-500">Free during live</span>
          )}
        </div>
      </div>

      {/* Right Column: Timing/Countdown & Actions */}
      <div className="flex w-full shrink-0 flex-col items-stretch gap-4 sm:flex-row sm:items-center md:w-auto md:min-w-[280px] md:justify-end">
        {/* Timing Information */}
        <div className="flex shrink-0 flex-col text-xs md:text-right">
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
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-lg bg-background/60 px-3 text-xs font-medium"
                onClick={() => onView(test.id)}
              >
                <Eye className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                View
              </Button>
              <Button
                size="sm"
                className="h-9 rounded-lg bg-amber-500 px-3 text-xs font-medium text-white hover:bg-amber-600"
                disabled
              >
                <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                {countdown !== null && countdown > 0 ? `In ${formatCountdown(countdown)}` : "Soon"}
              </Button>
            </>
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
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-lg bg-background/60 px-3 text-xs font-medium"
                onClick={() => onView(test.id)}
              >
                <Eye className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                View
              </Button>
              <Button
                size="sm"
                className="gradient-bg h-9 rounded-lg px-4 text-xs font-semibold"
                onClick={() => onStart(test.id)}
                disabled={attemptsRemaining <= 0}
              >
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Start
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
