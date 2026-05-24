import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Activity } from "lucide-react";

type TrialEducator = {
  uid: string;
  displayName?: string;
  email?: string;
  trialSeats: number;
  trialExpiryAt?: string | null;
};

function fmtDate(val?: string | null) {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function isExpired(val?: string | null) {
  if (!val) return false;
  return new Date(val).getTime() < Date.now();
}

export default function AdminTrials() {
  const [educators, setEducators] = useState<TrialEducator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "educators"), where("trialSeats", ">", 0));
    getDocs(q)
      .then((snap) => {
        const rows: TrialEducator[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            uid: d.id,
            displayName: data.displayName,
            email: data.email,
            trialSeats: data.trialSeats ?? 0,
            trialExpiryAt: data.trialExpiryAt ?? null,
          };
        });
        rows.sort((a, b) => {
          const aExp = a.trialExpiryAt ? new Date(a.trialExpiryAt).getTime() : Infinity;
          const bExp = b.trialExpiryAt ? new Date(b.trialExpiryAt).getTime() : Infinity;
          return aExp - bExp;
        });
        setEducators(rows);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">Active Trials</h1>
        <p className="mt-1 text-muted-foreground">Educators with allocated trial seats</p>
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-orange-500" />
            {loading
              ? "Loading…"
              : `${educators.length} educator${educators.length !== 1 ? "s" : ""} on trial`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">Loading…</p>
          ) : educators.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No active trials.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Educator</th>
                    <th className="pb-2 pr-4 font-medium">Email</th>
                    <th className="pb-2 pr-4 text-right font-medium">Trial Seats</th>
                    <th className="pb-2 pr-4 font-medium">Expires</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {educators.map((e) => {
                    const expired = isExpired(e.trialExpiryAt);
                    return (
                      <tr key={e.uid} className="border-b last:border-0">
                        <td className="py-3 pr-4 font-medium">{e.displayName || e.uid}</td>
                        <td className="py-3 pr-4 text-muted-foreground">{e.email || "—"}</td>
                        <td className="py-3 pr-4 text-right font-semibold">{e.trialSeats}</td>
                        <td className="py-3 pr-4">
                          <span className={expired ? "text-destructive" : ""}>
                            {fmtDate(e.trialExpiryAt)}
                          </span>
                        </td>
                        <td className="py-3">
                          {expired ? (
                            <Badge variant="destructive" className="text-xs">
                              Expired
                            </Badge>
                          ) : (
                            <Badge className="bg-orange-500/15 text-xs text-orange-600 hover:bg-orange-500/25">
                              Active
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
