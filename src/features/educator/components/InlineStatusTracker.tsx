import { Check } from "lucide-react";
import type { PageProgressUpdate } from "@shared/lib/aiQuestionImport";
import { useEffect, useState } from "react";

type Props = {
  updates: PageProgressUpdate[];
  isProcessing: boolean;
};

export default function InlineStatusTracker({ updates, isProcessing }: Props) {
  const [displayUpdates, setDisplayUpdates] = useState<PageProgressUpdate[]>([]);

  // Show only last 3 updates to avoid clutter
  useEffect(() => {
    setDisplayUpdates(updates.slice(-3));
  }, [updates]);

  if (displayUpdates.length === 0 && !isProcessing) return null;

  const latestUpdate = updates[updates.length - 1];
  const progressPercent = latestUpdate
    ? (latestUpdate.pageNumber / latestUpdate.totalPages) * 100
    : 0;

  return (
    <div className="mt-6 space-y-4">
      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">
            {isProcessing ? `Processing page ${latestUpdate?.pageNumber || 0}` : "Import complete"}
          </span>
          <span className="font-semibold text-primary">{Math.round(progressPercent)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Status Messages Stack */}
      <div className="relative h-16 overflow-hidden">
        <div className="absolute inset-0 space-y-2">
          {displayUpdates.map((update, idx) => {
            const isLatest = idx === displayUpdates.length - 1;
            const isSecond = idx === displayUpdates.length - 2;

            return (
              <div
                key={`${update.pageNumber}-${update.status}`}
                className={`flex transform items-center gap-2 rounded-lg px-3 py-2 transition-all duration-500 ease-in-out ${isLatest ? "translate-y-0 scale-100 opacity-100" : "-translate-y-2 scale-95 opacity-40"} ${isSecond ? "scale-97 -translate-y-1 opacity-60" : ""} ${!isLatest && !isSecond ? "-translate-y-4 scale-90 opacity-0" : ""} border bg-card/50 backdrop-blur-sm`}
              >
                {/* Status Icon */}
                <div className="shrink-0">
                  {update.status === "complete" ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : update.status === "detecting" ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                  ) : update.status === "detected" ? (
                    <span className="text-lg">🔍</span>
                  ) : (
                    <span className="text-lg">✅</span>
                  )}
                </div>

                {/* Message */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{update.message}</p>
                  {/* Show cumulative counts inline */}
                  {isLatest && (update.cumulativeDetected > 0 || update.cumulativeAccepted > 0) && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {update.cumulativeDetected} detected • {update.cumulativeAccepted} accepted
                    </p>
                  )}
                </div>

                {/* Page indicator */}
                {isLatest && (
                  <div className="shrink-0 text-xs font-medium text-muted-foreground">
                    {update.pageNumber}/{update.totalPages}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary stats */}
      {latestUpdate && (
        <div className="flex gap-2 text-xs">
          <div className="flex-1 rounded-md bg-blue-50 px-2.5 py-1.5 font-medium text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
            🔍 {latestUpdate.cumulativeDetected} detected
          </div>
          <div className="flex-1 rounded-md bg-green-50 px-2.5 py-1.5 font-medium text-green-700 dark:bg-green-950/30 dark:text-green-300">
            ✅ {latestUpdate.cumulativeAccepted} accepted
          </div>
        </div>
      )}
    </div>
  );
}
