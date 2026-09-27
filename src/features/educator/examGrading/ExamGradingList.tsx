import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileCheck2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Skeleton } from "@shared/ui/skeleton";
import { useAuth } from "@app/providers/AuthProvider";
import { createExam, listExams, type Exam } from "./api";

export default function ExamGradingList() {
  const { firebaseUser } = useAuth();

  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    load();
  }, [firebaseUser]);

  async function load() {
    if (!firebaseUser) return;
    setLoading(true);
    try {
      const token = await firebaseUser.getIdToken();
      setExams(await listExams(token));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!title.trim() || !subject.trim()) return toast.error("Title and subject are required");
    setCreating(true);
    try {
      const token = await firebaseUser?.getIdToken();
      const exam = await createExam(token, title.trim(), subject.trim());
      setExams((prev) => [exam, ...prev]);
      setCreateOpen(false);
      setTitle("");
      setSubject("");
      toast.success("Exam created");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCheck2 className="hidden h-6 w-6 text-primary md:block" />
          <div>
            <h1 className="text-2xl font-bold">Exam Grading</h1>
            <p className="text-sm text-muted-foreground">
              Upload a question paper, answer key, and student answer sheets — AI grades them
              automatically.
            </p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Exam
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : exams.length === 0 ? (
        <Card className="card-soft border-0">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FileCheck2 className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-lg font-semibold">No exams yet</p>
            <p className="text-sm text-muted-foreground">
              Create an exam to start uploading question papers and answer sheets.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {exams.map((exam) => (
            <Link key={exam.id} to={`/educator/exam-grading/${exam.id}`}>
              <Card className="h-full border-border/50 transition-colors hover:border-primary">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{exam.title}</CardTitle>
                    {exam.results_released && <Badge className="text-[10px]">Released</Badge>}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{exam.subject}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created {new Date(exam.created_at).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Exam</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input
                placeholder="e.g. Class XII Accountancy Mid-Term"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Subject *</Label>
              <Input
                placeholder="e.g. Accountancy"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
