import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Play,
  Plus,
  Sparkles,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Textarea } from "@shared/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Skeleton } from "@shared/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@shared/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@shared/ui/collapsible";
import { useAuth } from "@app/providers/AuthProvider";
import { useEmployee } from "@shared/contexts/EmployeeContext";
import { PERMISSIONS } from "@shared/lib/rolesConfig";
import { db } from "@shared/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import MultiFileDropzone from "@shared/components/MultiFileDropzone";
import {
  createAnswerSheet,
  extractQuestionsFromPaper,
  getExam,
  listAnswerKeyPages,
  listAnswerSheets,
  listQuestionPaperPages,
  listQuestions,
  listRosterStudents,
  releaseResults,
  setQuestions,
  startGrading,
  unreleaseResults,
  uploadAnswerKey,
  uploadAnswerSheetPages,
  uploadQuestionPaper,
  type Exam,
  type ExamQuestion,
  type PageImage,
  type QuestionInput,
  type RosterStudent,
} from "./api";

const STATUS_CLASS: Record<string, string> = {
  uploaded: "bg-slate-100 text-slate-700",
  pending: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  graded: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

function emptyQuestion(no: string): QuestionInput {
  return { question_no: no, question_text: "", max_marks: 1, marking_scheme: "" };
}

export default function ExamGradingDetail() {
  const { examId } = useParams<{ examId: string }>();
  const { firebaseUser } = useAuth();
  const { isEmployee, hasPermission } = useEmployee();
  const canPublish = !isEmployee || hasPermission(PERMISSIONS.TESTS_PUBLISH);
  const [releaseBusy, setReleaseBusy] = useState(false);

  const [exam, setExam] = useState<Exam | null>(null);
  const [gradingMode, setGradingMode] = useState<"instant" | "batch">("instant");
  const [questions, setQuestionsState] = useState<ExamQuestion[]>([]);
  const [students, setStudents] = useState<
    {
      sheet_id: string;
      student_name: string;
      student_roll: string | null;
      status: string;
      total_marks_awarded: number | null;
      total_max_marks: number | null;
    }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const [qpPages, setQpPages] = useState<PageImage[]>([]);
  const [akPages, setAkPages] = useState<PageImage[]>([]);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const [qpBusy, setQpBusy] = useState(false);
  const [akBusy, setAkBusy] = useState(false);

  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [questionsListExpanded, setQuestionsListExpanded] = useState(true);
  const [draftQuestions, setDraftQuestions] = useState<QuestionInput[]>([]);
  const [savingQuestions, setSavingQuestions] = useState(false);
  const [extractingQuestions, setExtractingQuestions] = useState(false);

  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [selectedStudentUid, setSelectedStudentUid] = useState<string>("");
  const [manualName, setManualName] = useState("");
  const [manualRoll, setManualRoll] = useState("");
  const [sheetFiles, setSheetFiles] = useState<File[]>([]);
  const [addingStudent, setAddingStudent] = useState(false);

  useEffect(() => {
    load();
  }, [examId, firebaseUser]);

  async function load() {
    if (!examId || !firebaseUser) return;
    setLoading(true);
    try {
      const token = await firebaseUser.getIdToken();
      const [examData, questionData, summary, eduSnap, qpData, akData] = await Promise.all([
        getExam(token, examId),
        listQuestions(token, examId),
        listAnswerSheets(token, examId),
        getDoc(doc(db, "educators", firebaseUser.uid)),
        listQuestionPaperPages(token, examId),
        listAnswerKeyPages(token, examId),
      ]);
      setExam(examData);
      setQuestionsState(questionData);
      setStudents(summary.students);
      setQpPages(qpData);
      setAkPages(akData);
      const mode = eduSnap.data()?.examConfig?.subjective?.gradingMode;
      if (mode === "instant" || mode === "batch") setGradingMode(mode);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  function openQuestionsDialog() {
    setDraftQuestions(
      questions.length > 0
        ? questions.map((q) => ({
            question_no: q.question_no,
            question_text: q.question_text || "",
            max_marks: q.max_marks,
            marking_scheme: q.marking_scheme,
          }))
        : [emptyQuestion("1")]
    );
    setQuestionsOpen(true);
  }

  async function saveQuestions() {
    if (!examId) return;
    const invalid = draftQuestions.some(
      (q) => !q.question_no.trim() || !q.marking_scheme.trim() || q.max_marks <= 0
    );
    if (invalid)
      return toast.error("Every question needs a number, marking scheme, and max marks > 0");

    setSavingQuestions(true);
    try {
      const token = await firebaseUser?.getIdToken();
      const saved = await setQuestions(token, examId, draftQuestions);
      setQuestionsState(saved);
      setQuestionsOpen(false);
      toast.success("Questions saved");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingQuestions(false);
    }
  }

  async function handleExtractQuestions() {
    if (!examId) return;
    setExtractingQuestions(true);
    try {
      const token = await firebaseUser?.getIdToken();
      const extracted = await extractQuestionsFromPaper(token, examId);
      setQuestionsState(extracted);
      toast.success(
        `Extracted ${extracted.length} question${extracted.length > 1 ? "s" : ""} from the question paper — review marks & marking scheme before grading.`
      );
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setExtractingQuestions(false);
    }
  }

  async function handleUploadQp(files: File[]) {
    if (!examId) return;
    setQpBusy(true);
    try {
      const token = await firebaseUser?.getIdToken();
      const pages = await uploadQuestionPaper(token, examId, files);
      setQpPages((prev) => [...prev, ...pages]);
      toast.success(`Question paper uploaded (${pages.length} page${pages.length > 1 ? "s" : ""})`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setQpBusy(false);
    }
  }

  async function handleUploadAnswerKey(files: File[]) {
    if (!examId) return;
    setAkBusy(true);
    try {
      const token = await firebaseUser?.getIdToken();
      const pages = await uploadAnswerKey(token, examId, files);
      setAkPages((prev) => [...prev, ...pages]);
      toast.success(`Answer key uploaded (${pages.length} page${pages.length > 1 ? "s" : ""})`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAkBusy(false);
    }
  }

  async function openAddStudent() {
    setSelectedStudentUid("");
    setManualName("");
    setManualRoll("");
    setSheetFiles([]);
    setAddStudentOpen(true);
    setRosterLoading(true);
    try {
      const token = await firebaseUser?.getIdToken();
      setRoster(await listRosterStudents(token));
    } catch {
      // Roster is a convenience picker — if monkey-king's roster can't be reached,
      // the educator can still fall back to entering the student's name manually.
      setRoster([]);
    } finally {
      setRosterLoading(false);
    }
  }

  async function handleAddStudent() {
    if (!examId) return;
    const picked = roster.find((r) => r.uid === selectedStudentUid);
    const name = picked?.name || manualName.trim();
    if (!name) return toast.error("Select a student or enter a name");
    if (sheetFiles.length === 0) return toast.error("Upload the student's answer sheet");

    setAddingStudent(true);
    try {
      const token = await firebaseUser?.getIdToken();
      const sheet = await createAnswerSheet(token, examId, {
        student_name: name,
        student_roll: manualRoll.trim() || undefined,
        student_uid: picked?.uid,
      });
      await uploadAnswerSheetPages(token, sheet.id, sheetFiles);
      toast.success("Answer sheet added");
      setAddStudentOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddingStudent(false);
    }
  }

  async function handleStartGrading(sheetId: string) {
    try {
      const token = await firebaseUser?.getIdToken();
      await startGrading(token, sheetId, gradingMode);
      toast.success("Grading queued");
      setStudents((prev) =>
        prev.map((s) => (s.sheet_id === sheetId ? { ...s, status: "pending" } : s))
      );
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleToggleRelease() {
    if (!exam) return;
    setReleaseBusy(true);
    try {
      const token = await firebaseUser?.getIdToken();
      const updated = exam.results_released
        ? await unreleaseResults(token, exam.id)
        : await releaseResults(token, exam.id);
      setExam(updated);
      toast.success(
        updated.results_released ? "Results released to students" : "Results unreleased"
      );
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setReleaseBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!exam) {
    return <div className="py-12 text-center text-muted-foreground">Exam not found.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="-ml-1">
            <Link to="/educator/exam-grading">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{exam.title}</h1>
              <Badge
                variant={exam.results_released ? "default" : "outline"}
                className="text-[10px]"
              >
                {exam.results_released ? "Released" : "Not released"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{exam.subject}</p>
          </div>
        </div>
        {canPublish && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={exam.results_released ? "outline" : "default"}
                size="sm"
                className="gap-2"
                disabled={releaseBusy}
                onClick={handleToggleRelease}
              >
                {releaseBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {exam.results_released ? "Unrelease Results" : "Release Results to Students"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {exam.results_released
                ? "Students currently see graded results — click to hide them again."
                : "Nothing is visible to students yet, even fully graded sheets. Release makes the whole exam's results visible at once."}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <Card>
        <Collapsible open={questionsListExpanded} onOpenChange={setQuestionsListExpanded}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Questions</CardTitle>
              <CardDescription>
                Marking scheme per question — grading is based on this.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* span wrapper: a disabled <button> swallows pointer
                      events so Radix's Tooltip never sees the hover — the
                      trigger needs a non-disabled element to attach to. */}
                  <span tabIndex={qpPages.length === 0 ? 0 : undefined}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleExtractQuestions}
                      disabled={qpPages.length === 0 || extractingQuestions}
                    >
                      {extractingQuestions ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-2 h-4 w-4" />
                      )}
                      Extract from Photos
                    </Button>
                  </span>
                </TooltipTrigger>
                {qpPages.length === 0 && (
                  <TooltipContent>
                    Upload the question paper first to extract questions from it.
                  </TooltipContent>
                )}
              </Tooltip>
              <Button size="sm" variant="outline" onClick={openQuestionsDialog}>
                {questions.length > 0 ? "Edit" : "Add Questions"}
              </Button>
              {questions.length > 0 && (
                <CollapsibleTrigger asChild>
                  <Button size="sm" variant="ghost" className="px-2">
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${questionsListExpanded ? "rotate-180" : ""}`}
                    />
                  </Button>
                </CollapsibleTrigger>
              )}
            </div>
          </CardHeader>
          {questions.length > 0 && (
            <CollapsibleContent>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">No.</TableHead>
                      <TableHead>Question</TableHead>
                      <TableHead className="w-24 text-right">Marks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {questions.map((q) => (
                      <TableRow key={q.id}>
                        <TableCell>{q.question_no}</TableCell>
                        <TableCell className="max-w-md truncate">
                          {q.question_text || "—"}
                        </TableCell>
                        <TableCell className="text-right">{q.max_marks}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </CollapsibleContent>
          )}
        </Collapsible>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Question Paper
              {qpPages.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {qpPages.length} page{qpPages.length > 1 ? "s" : ""}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Multiple page images, or a single PDF.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {qpPages.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {qpPages.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setPreviewImage({
                        url: p.imagekit_url,
                        alt: `Question paper page ${p.page_number}`,
                      })
                    }
                    className="shrink-0 cursor-zoom-in"
                  >
                    <img
                      src={p.imagekit_url}
                      alt={`Question paper page ${p.page_number}`}
                      className="h-20 w-16 rounded border border-border object-cover transition-opacity hover:opacity-80"
                    />
                  </button>
                ))}
              </div>
            )}
            <MultiFileDropzone onUpload={handleUploadQp} busy={qpBusy} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Answer Key
              {akPages.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {akPages.length} page{akPages.length > 1 ? "s" : ""}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Used as reference context during grading.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {akPages.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {akPages.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setPreviewImage({
                        url: p.imagekit_url,
                        alt: `Answer key page ${p.page_number}`,
                      })
                    }
                    className="shrink-0 cursor-zoom-in"
                  >
                    <img
                      src={p.imagekit_url}
                      alt={`Answer key page ${p.page_number}`}
                      className="h-20 w-16 rounded border border-border object-cover transition-opacity hover:opacity-80"
                    />
                  </button>
                ))}
              </div>
            )}
            <MultiFileDropzone onUpload={handleUploadAnswerKey} busy={akBusy} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Answer Sheets</CardTitle>
            <CardDescription>One per student — upload, then start grading.</CardDescription>
          </div>
          <Button size="sm" onClick={openAddStudent}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add Student
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {students.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No answer sheets yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Marks</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s) => (
                  <TableRow key={s.sheet_id}>
                    <TableCell className="font-medium">
                      {s.student_name}
                      {s.student_roll && (
                        <span className="ml-2 text-xs text-muted-foreground">{s.student_roll}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_CLASS[s.status] || "bg-slate-100 text-slate-700"}>
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {s.total_marks_awarded != null
                        ? `${s.total_marks_awarded}/${s.total_max_marks}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.status === "uploaded" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span tabIndex={questions.length === 0 ? 0 : undefined}>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleStartGrading(s.sheet_id)}
                                disabled={questions.length === 0}
                              >
                                <Play className="mr-1.5 h-3.5 w-3.5" />
                                Start Grading
                              </Button>
                            </span>
                          </TooltipTrigger>
                          {questions.length === 0 && (
                            <TooltipContent>
                              Add questions first — type them in, or extract them from the question
                              paper photos above.
                            </TooltipContent>
                          )}
                        </Tooltip>
                      )}
                      {(s.status === "graded" ||
                        s.status === "processing" ||
                        s.status === "pending") &&
                        (s.status === "pending" ? (
                          // Pending = queued, not yet claimed by the grading poller — Pass 1
                          // hasn't even run, so the review page is guaranteed to have zero
                          // graded questions to show. Disable instead of opening a blank page;
                          // "processing" stays clickable since Pass 2 writes each question's
                          // grade as it completes, so a partial view is genuinely useful there.
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span tabIndex={0}>
                                <Button size="sm" variant="outline" disabled>
                                  Review
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              Grading is queued — nothing to review yet
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Button size="sm" variant="outline" asChild>
                            <Link to={`/educator/exam-grading/${examId}/review/${s.sheet_id}`}>
                              Review
                            </Link>
                          </Button>
                        ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Questions dialog ── */}
      <Dialog open={questionsOpen} onOpenChange={setQuestionsOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Questions & Marking Scheme</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {draftQuestions.map((q, idx) => (
              <div key={idx} className="space-y-3 rounded-lg border border-border/60 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Question {idx + 1}</p>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => setDraftQuestions((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Question No. *</Label>
                    <Input
                      value={q.question_no}
                      onChange={(e) =>
                        setDraftQuestions((prev) =>
                          prev.map((p, i) =>
                            i === idx ? { ...p, question_no: e.target.value } : p
                          )
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Max Marks *</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={q.max_marks}
                      onChange={(e) =>
                        setDraftQuestions((prev) =>
                          prev.map((p, i) =>
                            i === idx ? { ...p, max_marks: Number(e.target.value) } : p
                          )
                        )
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Question Text</Label>
                  <Textarea
                    rows={2}
                    value={q.question_text}
                    onChange={(e) =>
                      setDraftQuestions((prev) =>
                        prev.map((p, i) =>
                          i === idx ? { ...p, question_text: e.target.value } : p
                        )
                      )
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Marking Scheme *</Label>
                  <Textarea
                    rows={2}
                    placeholder="How marks should be awarded for this question"
                    value={q.marking_scheme}
                    onChange={(e) =>
                      setDraftQuestions((prev) =>
                        prev.map((p, i) =>
                          i === idx ? { ...p, marking_scheme: e.target.value } : p
                        )
                      )
                    }
                  />
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                setDraftQuestions((prev) => [...prev, emptyQuestion(String(prev.length + 1))])
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Question
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuestionsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveQuestions} disabled={savingQuestions}>
              {savingQuestions && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add student dialog ── */}
      <Dialog open={addStudentOpen} onOpenChange={setAddStudentOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Student Answer Sheet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Student</Label>
              {rosterLoading ? (
                <Skeleton className="h-9 w-full rounded-md" />
              ) : roster.length > 0 ? (
                <Select value={selectedStudentUid} onValueChange={setSelectedStudentUid}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick from your roster" />
                  </SelectTrigger>
                  <SelectContent>
                    {roster.map((s) => (
                      <SelectItem key={s.uid} value={s.uid}>
                        {s.name} · {s.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No roster found — enter the student's name manually below.
                </p>
              )}
            </div>
            {!selectedStudentUid && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Student Name *</Label>
                  <Input value={manualName} onChange={(e) => setManualName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Roll No.</Label>
                  <Input value={manualRoll} onChange={(e) => setManualRoll(e.target.value)} />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Answer Sheet *</Label>
              <MultiFileDropzone
                onUpload={async (files) => setSheetFiles(files)}
                submitLabel={(n) => `Add ${n} file${n > 1 ? "s" : ""}`}
              />
              {sheetFiles.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {sheetFiles.length} file{sheetFiles.length > 1 ? "s" : ""} ready — click "Add &
                  Upload" below.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStudentOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddStudent} disabled={addingStudent}>
              {addingStudent && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add & Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-3xl">
          {previewImage && (
            <img
              src={previewImage.url}
              alt={previewImage.alt}
              className="max-h-[80vh] w-full rounded object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
