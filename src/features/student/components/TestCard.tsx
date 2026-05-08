import { useEffect, useState } from "react";
import { Clock, FileText, Lock, Unlock, Play, Eye, Timer, CalendarClock } from "lucide-react";
import { Card, CardContent, CardFooter } from "@shared/ui/card";
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
  "English": "bg-pastel-lavender",
  "Mathematics": "bg-pastel-yellow",
  "Physics": "bg-pastel-peach",
  "Chemistry": "bg-pastel-pink",
  "Biology": "bg-pastel-cream",
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

  return (
    <Card className={cn(
      "card-soft card-hover border-0 overflow-hidden",
      test.isLive ? "bg-red-50 dark:bg-red-900/10 ring-2 ring-red-500/20" :
      test.isUpcoming ? "bg-amber-50 dark:bg-amber-900/10 ring-2 ring-amber-400/30" :
      (subjectColors[test.subject] || "bg-pastel-cream")
    )}>
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-foreground line-clamp-2">{test.title}</h3>
              {test.isLive && (
                <Badge variant="destructive" className="animate-pulse py-0 px-1 text-[10px] h-4">
                  LIVE
                </Badge>
              )}
              {test.isUpcoming && (
                <Badge className="py-0 px-1 text-[10px] h-4 bg-amber-500 text-white">
                  UPCOMING
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{test.subject}</p>
          </div>
          {test.isLocked ? (
            <div className="p-2 rounded-lg bg-destructive/10">
              <Lock className="h-4 w-4 text-destructive" />
            </div>
          ) : (
            <div className="p-2 rounded-lg bg-green-500/10">
              <Unlock className="h-4 w-4 text-green-600" />
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full bg-background/60">
            <Clock className="h-3 w-3 mr-1" />
            {test.duration} min
          </Badge>
          <Badge variant="secondary" className="rounded-full bg-background/60">
            <FileText className="h-3 w-3 mr-1" />
            {test.questionsCount} Q
          </Badge>
          <Badge className={cn("rounded-full", difficultyColors[test.difficulty])}>
            {test.difficulty}
          </Badge>
        </div>

        {/* Attempts Info */}
        {!test.isLocked && (
          <div className="text-xs text-muted-foreground">
            {attemptsRemaining > 0 ? (
              <span>{attemptsRemaining} attempt{attemptsRemaining > 1 ? 's' : ''} remaining</span>
            ) : (
              <span className="text-destructive">No attempts remaining</span>
            )}
          </div>
        )}

        {/* Access window countdown */}
        {!test.isLocked && timeLeft !== null && (
          <div className={cn(
            "flex items-center gap-1 text-xs font-medium",
            timeLeft < 5 * 60 * 1000 ? "text-red-600" : "text-amber-600"
          )}>
            <Timer className="h-3 w-3" />
            {formatTimeLeft(timeLeft)}
          </div>
        )}

        {/* Price */}
        {test.isLocked && test.price > 0 && !test.isLive && (
          <div className="text-sm font-semibold text-primary">₹{test.price}</div>
        )}

        {test.isLive && (
          <div className="text-[10px] font-bold text-red-500 uppercase">
            Available for free during live window
          </div>
        )}

        {test.isUpcoming && countdown !== null && (
          <div className="flex items-center gap-1 text-xs font-medium text-amber-700">
            <CalendarClock className="h-3 w-3" />
            Starting in {formatCountdown(countdown)}
          </div>
        )}
      </CardContent>

      <CardFooter className="p-4 pt-0 gap-2">
        {test.isUpcoming ? (
          <>
            <Button
              variant="outline"
              className="flex-1 rounded-xl bg-background/60"
              onClick={() => onView(test.id)}
            >
              <Eye className="h-4 w-4 mr-2" />
              View
            </Button>
            <Button
              className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white"
              disabled
            >
              <CalendarClock className="h-4 w-4 mr-2" />
              {countdown !== null && countdown > 0 ? `In ${formatCountdown(countdown)}` : "Starting soon"}
            </Button>
          </>
        ) : test.isLocked ? (
          <Button
            className="w-full rounded-xl gradient-bg"
            onClick={() => onUnlock(test.id)}
          >
            <Lock className="h-4 w-4 mr-2" />
            Unlock
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              className="flex-1 rounded-xl bg-background/60"
              onClick={() => onView(test.id)}
            >
              <Eye className="h-4 w-4 mr-2" />
              View
            </Button>
            <Button
              className="flex-1 rounded-xl gradient-bg"
              onClick={() => onStart(test.id)}
              disabled={attemptsRemaining <= 0}
            >
              <Play className="h-4 w-4 mr-2" />
              Start
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
