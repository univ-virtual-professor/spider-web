import { Quote } from "lucide-react";

type Props = {
  quotes: string[];
  instituteName: string;
  primaryColor: string;
};

function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}

export function DailyQuoteCard({ quotes, instituteName, primaryColor }: Props) {
  if (!quotes || quotes.length === 0) return null;

  const quote = quotes[getDayOfYear() % quotes.length];
  if (!quote) return null;

  return (
    <div
      role="region"
      aria-label="Daily motivational quote"
      className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3"
    >
      <Quote className="mt-0.5 h-4 w-4 shrink-0" style={{ color: primaryColor }} />
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm italic leading-relaxed text-foreground">"{quote}"</p>
        <p className="text-[11px] text-muted-foreground">— {instituteName}</p>
      </div>
    </div>
  );
}
