/**
 * CreateGroupModal — two-step wizard for building comprehension/case-study groups.
 *
 * Step 1: Define passage metadata (type, title, subject, difficulty, passage content).
 * Step 2: Pick question_bank questions to attach to the group.
 *
 * On save:
 *   - Writes/updates question_groups/{id}
 *   - Batch-writes groupId + groupOrder back to each selected question_bank doc
 *   - Removes groupId from previously-linked questions that are deselected
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Link2, BookOpen, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
  writeBatch,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { logError } from "@shared/lib/errorLogger";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Textarea } from "@shared/ui/textarea";
import { Badge } from "@shared/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Checkbox } from "@shared/ui/checkbox";
import { cn } from "@shared/lib/utils";

import type { QuestionGroup, QuestionGroupType } from "@shared/lib/questionGroupTypes";

// ─── types ────────────────────────────────────────────────────────────────────

type BankQuestion = {
  id: string;
  question: string;
  topic?: string;
  subject?: string;
  difficulty?: string;
  groupId?: string;
  groupOrder?: number;
  format?: string;
  questionType?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass existing group to edit; omit to create new */
  groupToEdit?: QuestionGroup | null;
  /** Educator UID when used from educator question bank; omit for admin scope */
  educatorUid?: string;
  onSaved?: (group: QuestionGroup) => void;
};

// ─── component ───────────────────────────────────────────────────────────────

export default function CreateGroupModal({
  open,
  onOpenChange,
  groupToEdit,
  educatorUid,
  onSaved,
}: Props) {
  const isEdit = !!groupToEdit;

  // Step state
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 fields
  const [groupType, setGroupType] = useState<QuestionGroupType>(
    groupToEdit?.type ?? "comprehension"
  );
  const [title, setTitle] = useState(groupToEdit?.title ?? "");
  const [passageContent, setPassageContent] = useState(groupToEdit?.passageContent ?? "");
  const [subjectName, setSubjectName] = useState(groupToEdit?.subjectName ?? "");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">(
    groupToEdit?.difficulty ?? "medium"
  );

  // Step 2: question selection
  const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(groupToEdit?.questionIds ?? []);
  const [qSearch, setQSearch] = useState("");

  // Save state
  const [saving, setSaving] = useState(false);

  // Reset form when modal opens/groupToEdit changes
  useEffect(() => {
    if (open) {
      setStep(1);
      setGroupType(groupToEdit?.type ?? "comprehension");
      setTitle(groupToEdit?.title ?? "");
      setPassageContent(groupToEdit?.passageContent ?? "");
      setSubjectName(groupToEdit?.subjectName ?? "");
      setDifficulty(groupToEdit?.difficulty ?? "medium");
      setSelectedIds(groupToEdit?.questionIds ?? []);
      setQSearch("");
    }
  }, [open, groupToEdit]);

  // Load bank questions when moving to step 2
  useEffect(() => {
    if (step !== 2) return;
    (async () => {
      setBankLoading(true);
      try {
        const col = educatorUid
          ? collection(db, "educators", educatorUid, "question_bank")
          : collection(db, "question_bank");
        const snap = await getDocs(query(col, orderBy("createdAt", "desc")));
        setBankQuestions(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BankQuestion, "id">) }))
        );
      } catch (err) {
        logError(err, "CreateGroupModal.loadBankQuestions");
        toast.error("Failed to load question bank");
      } finally {
        setBankLoading(false);
      }
    })();
  }, [step, educatorUid]);

  const filteredBank = useMemo(() => {
    const q = qSearch.trim().toLowerCase();
    if (!q) return bankQuestions;
    return bankQuestions.filter(
      (bq) =>
        bq.question.toLowerCase().includes(q) ||
        (bq.topic || "").toLowerCase().includes(q) ||
        (bq.subject || "").toLowerCase().includes(q)
    );
  }, [bankQuestions, qSearch]);

  function toggleQuestion(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const canAdvance =
    step === 1
      ? title.trim().length > 0 && passageContent.trim().length > 0
      : selectedIds.length >= 2;

  async function handleSave() {
    if (selectedIds.length < 2) {
      toast.error("A group needs at least 2 questions");
      return;
    }

    setSaving(true);
    try {
      const col = educatorUid
        ? collection(db, "educators", educatorUid, "question_bank")
        : collection(db, "question_bank");

      const groupsCol = collection(db, "question_groups");

      let groupId: string;

      const groupPayload = {
        type: groupType,
        title: title.trim(),
        passageContent: passageContent.trim(),
        passageContentFormat: "html" as const,
        subjectName: subjectName.trim() || null,
        difficulty,
        questionIds: selectedIds,
        questionCount: selectedIds.length,
        uploadedByRole: educatorUid ? "educator" : "admin",
        updatedAt: serverTimestamp(),
      };

      if (isEdit && groupToEdit) {
        groupId = groupToEdit.id;
        await updateDoc(doc(db, "question_groups", groupId), groupPayload);
      } else {
        const newDoc = await addDoc(groupsCol, { ...groupPayload, createdAt: serverTimestamp() });
        groupId = newDoc.id;
      }

      // Determine which questions were previously in this group (if editing)
      const prevIds = new Set(groupToEdit?.questionIds ?? []);
      const nextIds = new Set(selectedIds);

      // Questions added to group
      const added = selectedIds.filter((id) => !prevIds.has(id));
      // Questions removed from group
      const removed = [...prevIds].filter((id) => !nextIds.has(id));

      const BATCH_SIZE = 490;

      // Write groupId + groupOrder to added questions
      if (added.length > 0) {
        let batch = writeBatch(db);
        let ops = 0;
        for (let i = 0; i < added.length; i++) {
          batch.update(doc(col, added[i]), {
            groupId,
            groupOrder: selectedIds.indexOf(added[i]) + 1,
            updatedAt: serverTimestamp(),
          });
          ops++;
          if (ops >= BATCH_SIZE) {
            await batch.commit();
            batch = writeBatch(db);
            ops = 0;
          }
        }
        if (ops > 0) await batch.commit();
      }

      // Update groupOrder for all selected questions (order may have changed)
      if (isEdit && selectedIds.length > 0) {
        let batch = writeBatch(db);
        let ops = 0;
        for (let i = 0; i < selectedIds.length; i++) {
          batch.update(doc(col, selectedIds[i]), {
            groupOrder: i + 1,
            updatedAt: serverTimestamp(),
          });
          ops++;
          if (ops >= BATCH_SIZE) {
            await batch.commit();
            batch = writeBatch(db);
            ops = 0;
          }
        }
        if (ops > 0) await batch.commit();
      }

      // Remove groupId from de-linked questions
      if (removed.length > 0) {
        let batch = writeBatch(db);
        let ops = 0;
        for (const id of removed) {
          batch.update(doc(col, id), {
            groupId: null,
            groupOrder: null,
            updatedAt: serverTimestamp(),
          });
          ops++;
          if (ops >= BATCH_SIZE) {
            await batch.commit();
            batch = writeBatch(db);
            ops = 0;
          }
        }
        if (ops > 0) await batch.commit();
      }

      toast.success(isEdit ? "Group updated" : "Group created");

      const savedGroup: QuestionGroup = {
        ...(groupToEdit || {}),
        id: groupId,
        type: groupType,
        title: title.trim(),
        passageContent: passageContent.trim(),
        passageContentFormat: "html",
        subjectName: subjectName.trim() || undefined,
        difficulty,
        questionIds: selectedIds,
        questionCount: selectedIds.length,
      } as QuestionGroup;

      onSaved?.(savedGroup);
      onOpenChange(false);
    } catch (err) {
      logError(err, "CreateGroupModal.handleSave");
      toast.error("Failed to save group");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {groupType === "case_study" ? (
              <FlaskConical className="h-5 w-5 text-primary" />
            ) : (
              <BookOpen className="h-5 w-5 text-primary" />
            )}
            {isEdit ? "Edit" : "Create"} Question Group
          </DialogTitle>
          <DialogDescription>
            Step {step} of 2 —{" "}
            {step === 1 ? "Define the passage or case scenario" : "Select questions for this group"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1">
          {step === 1 && (
            <div className="space-y-4 py-2">
              {/* Group type */}
              <div className="space-y-2">
                <Label>Group Type</Label>
                <div className="flex gap-3">
                  {(["comprehension", "case_study"] as QuestionGroupType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setGroupType(t)}
                      className={cn(
                        "flex flex-1 items-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors",
                        groupType === t
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-muted text-muted-foreground hover:border-primary/50"
                      )}
                    >
                      {t === "comprehension" ? (
                        <BookOpen className="h-4 w-4" />
                      ) : (
                        <FlaskConical className="h-4 w-4" />
                      )}
                      {t === "comprehension" ? "Comprehension Passage" : "Case Study"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="group-title">Title *</Label>
                <Input
                  id="group-title"
                  placeholder='e.g. "Passage: The Industrial Revolution"'
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="rounded-xl"
                />
              </div>

              {/* Passage content */}
              <div className="space-y-2">
                <Label htmlFor="group-passage">
                  {groupType === "case_study" ? "Case Scenario / Data" : "Passage Content"} *
                </Label>
                <Textarea
                  id="group-passage"
                  placeholder={
                    groupType === "case_study"
                      ? "Enter the case study scenario, data tables, or context..."
                      : "Enter the reading passage here..."
                  }
                  value={passageContent}
                  onChange={(e) => setPassageContent(e.target.value)}
                  className="min-h-[180px] rounded-xl font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  HTML supported. For tables in case studies, paste raw HTML{" "}
                  <code>&lt;table&gt;</code> markup.
                </p>
              </div>

              {/* Subject + difficulty */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="group-subject">Subject</Label>
                  <Input
                    id="group-subject"
                    placeholder="e.g. English"
                    value={subjectName}
                    onChange={(e) => setSubjectName(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Difficulty</Label>
                  <Select
                    value={difficulty}
                    onValueChange={(v) => setDifficulty(v as typeof difficulty)}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search questions..."
                  value={qSearch}
                  onChange={(e) => setQSearch(e.target.value)}
                  className="rounded-xl"
                />
                <Badge variant="secondary" className="shrink-0">
                  {selectedIds.length} selected
                </Badge>
              </div>

              {bankLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="max-h-[350px] space-y-2 overflow-y-auto pr-1">
                  {filteredBank.length === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No questions found
                    </p>
                  )}
                  {filteredBank.map((bq) => {
                    const isSelected = selectedIds.includes(bq.id);
                    const inDifferentGroup = bq.groupId && bq.groupId !== groupToEdit?.id;
                    return (
                      <div
                        key={bq.id}
                        onClick={() => !inDifferentGroup && toggleQuestion(bq.id)}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors",
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-muted hover:border-primary/40",
                          inDifferentGroup && "cursor-not-allowed opacity-50"
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          disabled={!!inDifferentGroup}
                          className="mt-0.5 shrink-0"
                          onCheckedChange={() => !inDifferentGroup && toggleQuestion(bq.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-foreground">{bq.question}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {bq.topic && (
                              <Badge variant="outline" className="text-xs">
                                {bq.topic}
                              </Badge>
                            )}
                            {bq.difficulty && (
                              <Badge variant="outline" className="text-xs capitalize">
                                {bq.difficulty}
                              </Badge>
                            )}
                            {bq.groupId && bq.groupId !== groupToEdit?.id && (
                              <Badge variant="secondary" className="gap-1 text-xs">
                                <Link2 className="h-3 w-3" /> In another group
                              </Badge>
                            )}
                            {bq.groupId && bq.groupId === groupToEdit?.id && (
                              <Badge variant="default" className="gap-1 text-xs">
                                <Link2 className="h-3 w-3" /> This group
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2">
          {step === 2 && (
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              className="rounded-xl"
              disabled={saving}
            >
              Back
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl"
            disabled={saving}
          >
            Cancel
          </Button>
          {step === 1 ? (
            <Button
              onClick={() => setStep(2)}
              disabled={!canAdvance}
              className="gradient-bg rounded-xl text-white"
            >
              Next: Add Questions
            </Button>
          ) : (
            <Button
              onClick={handleSave}
              disabled={saving || !canAdvance}
              className="gradient-bg rounded-xl text-white"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isEdit ? "Save Changes" : "Create Group"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
