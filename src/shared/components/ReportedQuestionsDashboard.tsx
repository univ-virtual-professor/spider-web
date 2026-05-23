import React, { useEffect, useState } from "react";
import { collection, query, where, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { Card, CardContent, CardTitle, CardDescription } from "@shared/ui/card";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import { AlertTriangle, CheckCircle2, Loader2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@app/providers/AuthProvider";
import { Link } from "react-router-dom";
import { HtmlView } from "@shared/lib/safeHtml";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function ReportedQuestionsDashboard({ isAdmin = false }: { isAdmin?: boolean }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      if (!profile?.uid) return;
      setLoading(true);
      try {
        const educatorTestIds = new Set<string>();
        if (!isAdmin) {
          // Fetch all tests for this educator
          const testsSnap = await getDocs(collection(db, "educators", profile.uid, "my_tests"));
          testsSnap.forEach((doc) => educatorTestIds.add(doc.id));
          educatorTestIds.add("manager"); // Include question bank context
        }

        const qReports = query(collection(db, "question_reports"), where("status", "==", "Open"));
        const snapshot = await getDocs(qReports);
        const fetchedReports: any[] = [];

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (isAdmin || educatorTestIds.has(data.contextId)) {
            fetchedReports.push({ id: docSnap.id, ...data });
          }
        });

        // Sort by createdAt desc
        fetchedReports.sort(
          (a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)
        );
        setReports(fetchedReports);
      } catch (err) {
        console.error("Error fetching reports:", err);
        toast.error("Failed to load reported questions");
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, [profile?.uid, isAdmin]);

  const handleResolve = async (reportId: string) => {
    try {
      await updateDoc(doc(db, "question_reports", reportId), {
        status: "Resolved",
      });
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      toast.success("Report marked as resolved");
    } catch (err) {
      console.error("Error resolving report:", err);
      toast.error("Failed to resolve report");
    }
  };

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex cursor-pointer items-center gap-2 rounded-full p-2 transition-colors hover:bg-primary hover:text-white"
            onClick={() => navigate("/educator/test-series")}
          >
            <ArrowLeft className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-3xl font-bold tracking-tight">Reported Questions</h1>
            <p className="mt-2 text-muted-foreground">
              Review and resolve issues reported by students or other educators.
            </p>
          </div>
        </div>
      </div>

      {reports.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 rounded-full bg-muted p-3">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <CardTitle>All caught up!</CardTitle>
          <CardDescription className="mt-2">
            There are no pending reports for any questions.
          </CardDescription>
        </Card>
      ) : (
        <div className="grid gap-4">
          {reports.map((report) => (
            <Card key={report.id}>
              <CardContent className="p-6">
                <div className="flex flex-col gap-4">
                  {/* Top Header: Badges & View Question */}
                  <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {report.category}
                      </Badge>
                      <Badge variant="outline">Severity: {report.severity}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {report.createdAt
                          ? format(report.createdAt.toDate(), "PP p")
                          : "Unknown Date"}
                      </span>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full shrink-0 sm:w-auto"
                      asChild
                    >
                      <Link
                        to={
                          isAdmin
                            ? report.contextId === "manager"
                              ? `/admin/question-bank`
                              : `/admin/questions/${report.contextId}`
                            : report.contextId === "manager"
                              ? `/educator/question-bank`
                              : `/educator/test-series/${report.contextId}/questions`
                        }
                      >
                        View Question <ExternalLink className="ml-2 h-3 w-3" />
                      </Link>
                    </Button>
                  </div>

                  {/* Content Area */}
                  <div className="space-y-3">
                    <div>
                      <h3 className="mb-1 text-sm font-medium text-muted-foreground">
                        Description:
                      </h3>
                      <p className="rounded-md bg-muted/50 p-3 text-sm">{report.description}</p>
                    </div>

                    {report.questionContent ? (
                      <div>
                        <h3 className="mb-1 text-sm font-medium text-muted-foreground">
                          Question Content:
                        </h3>
                        <div className="line-clamp-3 rounded-md bg-muted/20 p-3 text-sm">
                          <HtmlView
                            html={report.questionContent}
                            className="text-sm [&_img]:hidden"
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Footer: Reporter & Resolve Action */}
                  <div className="mt-2 flex flex-col items-start justify-between gap-4 border-t pt-4 sm:flex-row sm:items-center">
                    <div className="text-sm text-muted-foreground">
                      Reported by{" "}
                      <span className="font-medium text-foreground">
                        {report.reportedByName || `User ${report.reportedBy.substring(0, 5)}...`}
                      </span>{" "}
                      <span className="capitalize">({report.reportedByRole})</span>
                    </div>

                    <Button onClick={() => handleResolve(report.id)} className="w-full sm:w-auto">
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Resolve Issue
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
