import { useEffect, useState } from "react";

/** Counts up from 0, resetting whenever `questionKey` changes — "time on this question" for the
 *  practice player (BUILD-NOTES st_practice shows an elapsed, not countdown, per-question timer). */
export function QuestionElapsedTimer({ questionKey }: { questionKey: string }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    setSeconds(0);
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [questionKey]);

  const mm = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const ss = (seconds % 60).toString().padStart(2, "0");

  return (
    <span className="font-ds-mono text-[11.5px] font-medium text-ds-ink/45">
      {mm}:{ss} on this question
    </span>
  );
}
