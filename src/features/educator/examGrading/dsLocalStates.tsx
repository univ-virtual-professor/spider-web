// Minimal local stand-ins for the shared states ticket 1 (acf188ba) is adding to
// src/shared/ui/ds/index.tsx — DsEmpty, DsSkeletonRows, DsInlineError, DsFrozenBadge.
// Kept local to this feature folder (not src/shared/ui/ds/) per the revamp's
// parallel-work note, so this ticket doesn't touch ds/index.tsx or collide with
// ticket 1's own edits there. Swap these for the real shared ones once ticket 1
// merges into master_revamped.
import type { ReactNode } from "react";

export function DsEmpty({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="font-ds-sans text-[13px] font-semibold text-ds-ink">{title}</p>
      {body && <p className="max-w-sm font-ds-sans text-[12px] text-ds-slate">{body}</p>}
      {action}
    </div>
  );
}

export function DsSkeletonRows({ rows = 5, height = 48 }: { rows?: number; height?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center border-b border-ds-ink/[.055] px-4"
          style={{ height }}
        >
          <div className="h-3 w-full max-w-[220px] animate-pulse rounded bg-ds-fill" />
        </div>
      ))}
    </div>
  );
}

export function DsInlineError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[8px] border border-ds-accent/25 bg-ds-accent/[.06] px-4 py-3">
      <p className="flex-1 font-ds-sans text-[12px] text-ds-accent">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 font-ds-sans text-[11.5px] font-semibold text-ds-accent underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function DsFrozenBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-[5px] bg-ds-fill px-2 py-0.5 font-ds-mono text-[10.5px] font-semibold uppercase tracking-wide text-ds-ink/55">
      Frozen
    </span>
  );
}
