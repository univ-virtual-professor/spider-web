// Design-system primitives matching the "Edtech Platform UI Mockups" Claude
// Design project (Build Notes.dc.html §02 Components). Additive to the app's
// existing shadcn components — use these only on screens deliberately built
// to match those mockups (Enrolments, Attendance Overview, Exam Schedule,
// Website Pages so far), not as a wholesale replacement elsewhere.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Lock, RefreshCw } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { Button } from "@shared/ui/button";

// ── Page header ──────────────────────────────────────────────────────────
// "Primary action is the screen's single most likely intent."
export function DsPageHeader({
  title,
  subtitle,
  primary,
  secondary,
}: {
  title: string;
  subtitle?: string;
  primary?: { label: string; onClick: () => void; icon?: ReactNode; disabled?: boolean };
  secondary?: { label: string; onClick: () => void; icon?: ReactNode };
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="font-ds-serif text-[23px] font-semibold leading-[28px] text-ds-ink">
          {title}
        </h1>
        {subtitle && <p className="mt-1 font-ds-sans text-[12.5px] text-ds-slate">{subtitle}</p>}
      </div>
      {(primary || secondary) && (
        <div className="flex items-center gap-2">
          {secondary && (
            <Button
              variant="outline"
              className="border-ds-ink/15 font-ds-sans text-[12.5px] font-semibold text-ds-ink hover:bg-ds-fill"
              onClick={secondary.onClick}
            >
              {secondary.icon}
              {secondary.label}
            </Button>
          )}
          {primary && (
            <Button
              className="bg-ds-accent font-ds-sans text-[12.5px] font-semibold text-white hover:bg-ds-accent/90"
              onClick={primary.onClick}
              disabled={primary.disabled}
            >
              {primary.icon}
              {primary.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── KPI card / row ───────────────────────────────────────────────────────
// "Meter is proportional, never decorative. Omit the row entirely rather
// than pad it."
type KpiTone = "accent" | "info" | "positive" | "slate";
const TONE_CLASS: Record<KpiTone, string> = {
  accent: "bg-ds-accent",
  info: "bg-ds-info",
  positive: "bg-ds-positive",
  slate: "bg-ds-slate",
};

export function DsKpiRow({
  items,
}: {
  items: { label: string; value: string; sub?: string; tone: KpiTone; pct?: number }[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item, i) => (
        <div key={i} className="rounded-[10px] border border-ds-ink/[.09] bg-ds-surface p-4">
          <div className="font-ds-sans text-[10.5px] font-medium uppercase tracking-[.05em] text-ds-ink/45">
            {item.label}
          </div>
          <div className="mt-1.5 font-ds-serif text-[22px] font-semibold leading-none text-ds-ink">
            {item.value}
          </div>
          {item.sub && (
            <div className="mt-1 font-ds-sans text-[11px] text-ds-ink/45">{item.sub}</div>
          )}
          {typeof item.pct === "number" && (
            <div className="mt-2.5 h-[3px] overflow-hidden rounded-full bg-ds-fill">
              <div
                className={cn("h-full rounded-full", TONE_CLASS[item.tone])}
                style={{ width: `${Math.max(0, Math.min(100, item.pct))}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Status pill ──────────────────────────────────────────────────────────
type PillTone = "accent" | "info" | "positive" | "slate" | "neutral";
const PILL_CLASS: Record<PillTone, string> = {
  accent: "bg-ds-accent/15 text-ds-accent",
  info: "bg-ds-info/15 text-ds-info",
  positive: "bg-ds-positive/15 text-ds-positive",
  slate: "bg-ds-slate/15 text-ds-slate",
  neutral: "bg-ds-fill text-ds-ink/60",
};

export function DsStatusPill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[5px] px-2 py-0.5 font-ds-mono text-[10.5px] font-semibold uppercase tracking-wide",
        PILL_CLASS[tone]
      )}
    >
      {children}
    </span>
  );
}

// ── Meter ─────────────────────────────────────────────────────────────────
export function DsMeter({ pct, tone = "accent" }: { pct: number; tone?: KpiTone }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-ds-fill">
        <div
          className={cn("h-full rounded-full", TONE_CLASS[tone])}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <span className="w-9 font-ds-mono text-[11.5px] font-medium text-ds-ink">
        {Math.round(pct)}%
      </span>
    </div>
  );
}

// ── Card shell (plain white card, the base every ds section sits in) ────
export function DsCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-[10px] border border-ds-ink/[.09] bg-ds-surface", className)}>
      {children}
    </div>
  );
}

export function DsCardHeader({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-ds-ink/[.08] px-4 py-3">
      <div className="font-ds-sans text-[13.5px] font-semibold text-ds-ink">{title}</div>
      <div className="flex-1" />
      {meta && <div className="font-ds-mono text-[11.5px] text-ds-ink/45">{meta}</div>}
      {action}
    </div>
  );
}

// ── Table primitives (columns passed as a CSS grid-template-columns) ────
export function DsTableHead({ columns, cols }: { columns: string[]; cols: string }) {
  return (
    <div
      className="grid items-center border-b border-ds-ink/[.07] bg-ds-canvas px-4 font-ds-sans text-[10.5px] font-medium uppercase tracking-[.05em] text-ds-ink/45"
      style={{ gridTemplateColumns: cols, height: 32 }}
    >
      {columns.map((c, i) => (
        <div key={i} className={i === columns.length - 1 ? "text-right" : undefined}>
          {c}
        </div>
      ))}
    </div>
  );
}

export function DsTableRow({
  cols,
  height = 48,
  className,
  children,
}: {
  cols: string;
  height?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid items-center border-b border-ds-ink/[.055] px-4 font-ds-sans text-[12.5px] text-ds-ink",
        className
      )}
      style={{ gridTemplateColumns: cols, height }}
    >
      {children}
    </div>
  );
}

// ── Detail rail (280-340px right column) ─────────────────────────────────
export function DsDetailRail({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex w-full flex-col gap-3.5 lg:w-[340px]", className)}>{children}</div>
  );
}

export function DsSplitLayout({
  railWidth = "340px",
  children,
}: {
  railWidth?: string;
  children: [ReactNode, ReactNode];
}) {
  return (
    <div
      className="grid items-start gap-3.5"
      style={{ gridTemplateColumns: `minmax(0,1fr) ${railWidth}` }}
    >
      {children[0]}
      {children[1]}
    </div>
  );
}

// ── Alert strip (accent tint + up to 2 actions) — non-modal, dismissible ──
export function DsAlertStrip({
  title,
  body,
  actions,
}: {
  title: string;
  body: string;
  actions?: { label: string; onClick: () => void; primary?: boolean }[];
}) {
  return (
    <div className="rounded-[10px] border border-ds-accent/25 bg-ds-accent/[.08] p-4">
      <div className="font-ds-sans text-[13px] font-semibold text-ds-accent">{title}</div>
      <div className="mt-1.5 font-ds-sans text-[11.5px] leading-[1.55] text-ds-accent/80">
        {body}
      </div>
      {actions && actions.length > 0 && (
        <div className="mt-2.5 flex gap-1.5">
          {actions.map((a, i) => (
            <button
              key={i}
              onClick={a.onClick}
              className={cn(
                "h-7 rounded-md px-2.5 font-ds-sans text-[11.5px] font-semibold",
                a.primary
                  ? "bg-ds-accent text-white"
                  : "border border-ds-accent/30 bg-white text-ds-accent"
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Shared states (BUILD-NOTES §03) ───────────────────────────────────────
// Every screen needs these six states. Keep them here instead of re-rolling
// an empty/loading/error block inline per screen.

// Empty: new institute/batch/no records yet. Exactly one primary action —
// the single action that creates the first record.
export function DsEmpty({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-ds-ink/[.14] bg-ds-surface px-6 py-14 text-center">
      <div className="font-ds-sans text-[13.5px] font-semibold text-ds-ink">{title}</div>
      {body && (
        <div className="max-w-sm font-ds-sans text-[12.5px] leading-[1.55] text-ds-ink/55">
          {body}
        </div>
      )}
      {action && (
        <Button
          className="mt-2 bg-ds-accent font-ds-sans text-[12.5px] font-semibold text-white hover:bg-ds-accent/90"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

// Loading: skeleton rows drawn at the real row height so a table never jumps
// once data arrives. No spinners inside cards.
export function DsSkeletonRows({
  rows = 5,
  rowHeight = 48,
  cols = "1fr",
}: {
  rows?: number;
  rowHeight?: number;
  cols?: string;
}) {
  return (
    <div role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="grid items-center gap-3 border-b border-ds-ink/[.055] px-4 last:border-b-0"
          style={{ gridTemplateColumns: cols, height: rowHeight }}
        >
          {cols.split(" ").map((_, c) => (
            <div key={c} className="h-3 w-full animate-pulse rounded bg-ds-fill" />
          ))}
        </div>
      ))}
    </div>
  );
}

// Error: failed scan upload, generation failure. Inline in the card that
// owns the data, with a retry — never a page-level redirect.
export function DsInlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] border border-ds-accent/25 bg-ds-accent/[.06] px-4 py-3">
      <div className="font-ds-sans text-[12.5px] text-ds-accent">{message}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 rounded-md border border-ds-accent/30 bg-white px-2.5 py-1 font-ds-sans text-[11.5px] font-semibold text-ds-accent"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      )}
    </div>
  );
}

// Permission: an out-of-scope route is absent from nav; a deep link to it
// resolves here instead of a 403 or a silent redirect.
export function DsPermissionNotice({ backHref = "/" }: { backHref?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[10px] border border-ds-ink/[.09] bg-ds-surface px-6 py-14 text-center">
      <Lock className="h-5 w-5 text-ds-ink/35" />
      <div className="font-ds-sans text-[13.5px] font-semibold text-ds-ink">
        This isn't part of your role
      </div>
      <div className="max-w-sm font-ds-sans text-[12.5px] leading-[1.55] text-ds-ink/55">
        Your account doesn't have access to this page. If you think this is wrong, ask whoever
        manages staff access at your institute to update your role.
      </div>
      <Link
        to={backHref}
        className="mt-2 rounded-md bg-ds-accent px-3 py-1.5 font-ds-sans text-[12.5px] font-semibold text-white hover:bg-ds-accent/90"
      >
        Back to dashboard
      </Link>
    </div>
  );
}

// Frozen: published exams, released results, submitted attendance — the
// record is read-only; edits go through a correction request, not an inline edit.
export function DsFrozenBadge({ label = "Locked" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[5px] bg-ds-fill px-2 py-0.5 font-ds-mono text-[10.5px] font-semibold uppercase tracking-wide text-ds-ink/55">
      <Lock className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}
