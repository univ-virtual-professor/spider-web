import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Eye, Trophy, Clock, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { cn } from "@shared/lib/utils";
import { Attempt } from "@features/student/types";

interface AttemptTableProps {
  attempts: Attempt[];
  showTest?: boolean;
  compact?: boolean;
}

const statusConfig = {
  completed: {
    label: "Completed",
    icon: CheckCircle,
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  "in-progress": {
    label: "In Progress",
    icon: Loader2,
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  expired: {
    label: "Expired",
    icon: AlertCircle,
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
};

export function AttemptTable({ attempts, showTest = true, compact = false }: AttemptTableProps) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            {showTest && <TableHead>Test</TableHead>}
            <TableHead className="hidden text-center md:table-cell">Date</TableHead>
            <TableHead className="text-center">Score</TableHead>
            <TableHead className="hidden text-center md:table-cell">Accuracy</TableHead>
            {!compact && <TableHead className="hidden text-center md:table-cell">Time</TableHead>}
            {!compact && <TableHead className="hidden text-center md:table-cell">Rank</TableHead>}
            <TableHead className="hidden text-center md:table-cell">Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {attempts.map((attempt) => {
            const status = statusConfig[attempt.status];
            const StatusIcon = status.icon;

            return (
              <TableRow key={attempt.id} className="hover:bg-muted/30">
                {showTest && (
                  <TableCell className="max-w-[180px] font-medium">
                    <div className="truncate">{attempt.testTitle}</div>
                    <div className="text-xs text-muted-foreground">{attempt.subject}</div>
                  </TableCell>
                )}
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  {format(new Date(attempt.createdAt), "MMM d")}
                  {!compact && (
                    <div className="hidden text-xs md:block">
                      {format(new Date(attempt.createdAt), "h:mm a")}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {attempt.status === "completed" ? (
                    <span className="font-semibold">
                      {attempt.score}/{attempt.maxScore}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden text-center md:table-cell">
                  {attempt.status === "completed" ? (
                    <span
                      className={cn(
                        "font-medium",
                        attempt.accuracy >= 80
                          ? "text-green-600"
                          : attempt.accuracy >= 60
                            ? "text-yellow-600"
                            : "text-red-500"
                      )}
                    >
                      {attempt.accuracy}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                {!compact && (
                  <TableCell className="hidden text-center md:table-cell">
                    {attempt.status === "completed" ? (
                      <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDuration(attempt.timeSpent)}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
                {!compact && (
                  <TableCell className="hidden text-center md:table-cell">
                    {attempt.status === "completed" && attempt.rank > 0 ? (
                      <div className="flex items-center justify-center gap-1">
                        <Trophy
                          className={cn(
                            "h-3 w-3",
                            attempt.rank <= 3 ? "text-yellow-500" : "text-muted-foreground"
                          )}
                        />
                        <span className="font-medium">#{attempt.rank}</span>
                        <span className="text-xs text-muted-foreground">
                          /{attempt.totalParticipants}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
                <TableCell className="hidden text-center md:table-cell">
                  <Badge variant="secondary" className={cn("rounded-full", status.className)}>
                    <StatusIcon
                      className={cn(
                        "mr-1 h-3 w-3",
                        attempt.status === "in-progress" && "animate-spin"
                      )}
                    />
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {attempt.status === "completed" ? (
                    <Button size="sm" variant="ghost" className="rounded-lg" asChild>
                      <Link to={`/student/results/${attempt.id}`}>
                        <Eye className="h-4 w-4" />
                        <span className="hidden md:block">View</span>
                      </Link>
                    </Button>
                  ) : attempt.status === "in-progress" ? (
                    <Button size="sm" variant="default" className="gradient-bg rounded-lg" asChild>
                      <Link to={`/student/tests/${attempt.testId}/attempt`}>Continue</Link>
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
