import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Skeleton } from "@shared/ui/skeleton";
import { useAuth } from "@app/providers/AuthProvider";
import { db } from "@shared/lib/firebase";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";

type PendingAttempt = {
  id: string;
  testTitle?: string;
  subject?: string;
  studentId?: string;
  studentName?: string;
  submittedAt?: any;
  pendingManualReviewCount?: number;
};

function toMillis(v: any): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return 0;
}

function formatDate(v: any) {
  const ms = toMillis(v);
  if (!ms) return "—";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SubjectiveReviewQueue() {
  const { firebaseUser, profile } = useAuth();
  const educatorId = profile?.educatorId || firebaseUser?.uid || null;

  const [attempts, setAttempts] = useState<PendingAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!educatorId) return;

    const q = query(
      collection(db, "attempts"),
      where("educatorId", "==", educatorId),
      where("pendingManualReviewCount", ">", 0),
      orderBy("pendingManualReviewCount", "desc"),
      orderBy("submittedAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setAttempts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setLoading(false);
      },
      (err) => {
        console.error("[SubjectiveReviewQueue] Firestore query failed:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [educatorId]);

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="hidden h-6 w-6 text-amber-600 md:block" />
        <div>
          <h1 className="text-2xl font-bold">Review Submissions</h1>
          <p className="text-sm text-muted-foreground">
            Subjective answers flagged for manual grading
          </p>
        </div>
        {attempts.length > 0 && (
          <Badge className="bg-amber-100 text-amber-700">{attempts.length} pending</Badge>
        )}
      </div>

      {attempts.length === 0 ? (
        <Card className="card-soft border-0">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-lg font-semibold">All caught up!</p>
            <p className="text-sm text-muted-foreground">
              No subjective answers pending your review.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Pending Reviews</CardTitle>
            <CardDescription>
              Answers where AI confidence was below 50% or evaluation failed
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-y border-border/50 bg-muted/30">
                  <tr>
                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      Test
                    </th>
                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      Student
                    </th>
                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      Pending
                    </th>
                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      Submitted
                    </th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {attempts.map((a) => (
                    <tr key={a.id} className="transition-colors hover:bg-muted/20">
                      <td className="px-6 py-4 text-sm font-semibold">
                        {a.testTitle || "Untitled Test"}
                        {a.subject && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {a.subject}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {a.studentName || a.studentId?.slice(0, 8) + "…"}
                      </td>
                      <td className="px-6 py-4">
                        <Badge className="bg-amber-100 text-amber-700">
                          {a.pendingManualReviewCount} answer
                          {(a.pendingManualReviewCount ?? 0) > 1 ? "s" : ""}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-xs text-muted-foreground">
                        {formatDate(a.submittedAt)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button size="sm" className="rounded-lg" asChild>
                          <Link to={`/educator/review-submissions/${a.id}`}>Grade</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
