import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Switch } from "@shared/ui/switch";
import { Badge } from "@shared/ui/badge";
import { toast } from "sonner";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { Key, Clock, Copy, Check, RotateCcw, Monitor, Globe, Layers } from "lucide-react";
import { cn } from "@shared/lib/utils";

export type Batch = {
  id: string;
  name: string;
  label: string;
  branchId: string;
  courseId: string;
};

type ExamMode = "web" | "desktop" | "both";

type ProctoringConfig = {
  faceDetection: boolean;
  phoneDetection: boolean;
  eyeGaze: boolean;
  photoCapture: boolean;
  violationThreshold: number;
};

const DEFAULT_PROCTORING: ProctoringConfig = {
  faceDetection: true,
  phoneDetection: true,
  eyeGaze: true,
  photoCapture: true,
  violationThreshold: 10,
};

type BatchConfig = {
  accessType: "scheduled" | "access_code";
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  isScheduleActive: boolean;
  code: string;
  maxUses: string;
  expiresAt: string;
  windowMinutes: string;
  attemptsAllowed: string;
  examMode: ExamMode;
  proctoringConfig: ProctoringConfig;
};

function genCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function toEndOfDay(s: string): Timestamp | null {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return Timestamp.fromDate(new Date(y, m - 1, d, 23, 59, 59, 999));
}

function defaultConfig(attemptsAllowed = "3"): BatchConfig {
  return {
    accessType: "scheduled",
    startDate: "",
    startTime: "09:00",
    endDate: "",
    endTime: "23:59",
    isScheduleActive: true,
    code: genCode(),
    maxUses: "100",
    expiresAt: "",
    windowMinutes: "0",
    attemptsAllowed,
    examMode: "web",
    proctoringConfig: { ...DEFAULT_PROCTORING },
  };
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  test: { id: string; title?: string; attemptsAllowed?: number } | null;
  allBatches: Batch[];
  educatorId: string;
  preselectedBatchId?: string;
  allTests?: { id: string; title?: string; attemptsAllowed?: number }[];
}

export default function AssignAndScheduleDialog({
  open,
  onOpenChange,
  test: initialTest,
  allBatches,
  educatorId,
  preselectedBatchId,
  allTests = [],
}: Props) {
  const needsTestPick = !initialTest && !!preselectedBatchId;
  const [selectedTest, setSelectedTest] = useState<{ id: string; title?: string } | null>(
    initialTest
  );
  const test = initialTest ?? selectedTest;

  // step: 0 = pick test (only when no test given), 1 = pick batches, 2 = access method
  const initialStep = needsTestPick ? 0 : preselectedBatchId ? 2 : 1;
  const [step, setStep] = useState<0 | 1 | 2>(initialStep);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    preselectedBatchId ? [preselectedBatchId] : []
  );
  const [perBatch, setPerBatch] = useState(false);
  const [globalConfig, setGlobalConfig] = useState<BatchConfig>(() =>
    defaultConfig(String(initialTest?.attemptsAllowed ?? 3))
  );
  const [perBatchConfigs, setPerBatchConfigs] = useState<Record<string, BatchConfig>>({});
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const reset = () => {
    setStep(initialStep);
    setSelectedTest(initialTest);
    setSelectedIds(preselectedBatchId ? [preselectedBatchId] : []);
    setPerBatch(false);
    setGlobalConfig(defaultConfig(String(initialTest?.attemptsAllowed ?? 3)));
    setPerBatchConfigs({});
    setSaving(false);
    setCopied(null);
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  function toggleBatch(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function getCfg(batchId: string): BatchConfig {
    return perBatchConfigs[batchId] ?? globalConfig;
  }

  function updateGlobal(field: keyof BatchConfig, value: any) {
    setGlobalConfig((prev) => ({ ...prev, [field]: value }));
  }

  function updatePerBatch(batchId: string, field: keyof BatchConfig, value: any) {
    setPerBatchConfigs((prev) => ({
      ...prev,
      [batchId]: { ...(prev[batchId] ?? { ...globalConfig }), [field]: value },
    }));
  }

  function renderForm(
    cfg: BatchConfig,
    update: (field: keyof BatchConfig, value: any) => void,
    codeKey: string
  ) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => update("accessType", "scheduled")}
            className={cn(
              "flex flex-1 items-center gap-2 rounded-xl border-2 p-3 text-left transition-all",
              cfg.accessType === "scheduled"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted"
            )}
          >
            <Clock className="h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">Schedule</p>
              <p className="text-xs text-muted-foreground">Set start/end time</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => update("accessType", "access_code")}
            className={cn(
              "flex flex-1 items-center gap-2 rounded-xl border-2 p-3 text-left transition-all",
              cfg.accessType === "access_code"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted"
            )}
          >
            <Key className="h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">Access Code</p>
              <p className="text-xs text-muted-foreground">Student enters code</p>
            </div>
          </button>
        </div>

        {cfg.accessType === "scheduled" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">
                  Start date <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={cfg.startDate}
                  onChange={(e) => update("startDate", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Start time</Label>
                <Input
                  type="time"
                  value={cfg.startTime}
                  onChange={(e) => update("startTime", e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">
                  End date <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={cfg.endDate}
                  onChange={(e) => update("endDate", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End time</Label>
                <Input
                  type="time"
                  value={cfg.endTime}
                  onChange={(e) => update("endTime", e.target.value)}
                />
              </div>
            </div>
          </>
        )}

        {cfg.accessType === "access_code" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Code</Label>
              <div className="flex gap-2">
                <Input
                  value={cfg.code}
                  onChange={(e) => update("code", e.target.value.toUpperCase())}
                  className="font-mono uppercase"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Generate"
                  onClick={() => update("code", genCode())}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Copy"
                  onClick={() => {
                    navigator.clipboard.writeText(cfg.code);
                    setCopied(codeKey);
                    setTimeout(() => setCopied(null), 2000);
                  }}
                >
                  {copied === codeKey ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Max Uses</Label>
                <Input
                  type="number"
                  min="1"
                  value={cfg.maxUses}
                  onChange={(e) => update("maxUses", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Expiry date</Label>
                <Input
                  type="date"
                  value={cfg.expiresAt}
                  onChange={(e) => update("expiresAt", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Window (minutes, 0 = unlimited)</Label>
              <Input
                type="number"
                min="0"
                value={cfg.windowMinutes}
                onChange={(e) => update("windowMinutes", e.target.value)}
              />
            </div>
          </>
        )}

        <div className="space-y-1">
          <Label className="text-xs">Attempts Allowed</Label>
          <Input
            type="number"
            min="1"
            value={cfg.attemptsAllowed}
            onChange={(e) => update("attemptsAllowed", e.target.value)}
          />
        </div>

        {/* Exam delivery mode */}
        <div className="space-y-1.5">
          <Label className="text-xs">Exam Delivery</Label>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { value: "web", label: "Web", Icon: Globe },
                { value: "desktop", label: "App only", Icon: Monitor },
                { value: "both", label: "Both", Icon: Layers },
              ] as { value: ExamMode; label: string; Icon: React.ElementType }[]
            ).map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => update("examMode", value)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-xs font-medium transition",
                  cfg.examMode === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Proctoring config — only for desktop/both */}
        {cfg.examMode !== "web" && (
          <div className="space-y-2 rounded-xl border border-border p-3">
            <Label className="text-xs font-medium">Proctoring</Label>
            {(
              [
                { key: "faceDetection", label: "Face detection" },
                { key: "phoneDetection", label: "Phone detection" },
                { key: "eyeGaze", label: "Eye gaze" },
                { key: "photoCapture", label: "Photo capture" },
              ] as { key: keyof ProctoringConfig; label: string }[]
            ).map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-xs text-foreground">{label}</span>
                <button
                  type="button"
                  onClick={() =>
                    update("proctoringConfig", {
                      ...cfg.proctoringConfig,
                      [key]: !cfg.proctoringConfig[key],
                    })
                  }
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                    cfg.proctoringConfig[key] ? "bg-primary" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition",
                      cfg.proctoringConfig[key] ? "translate-x-[18px]" : "translate-x-[2px]"
                    )}
                  />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-xs text-muted-foreground">Warn after</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={cfg.proctoringConfig.violationThreshold}
                  onChange={(e) =>
                    update("proctoringConfig", {
                      ...cfg.proctoringConfig,
                      violationThreshold: Math.min(50, Math.max(1, Number(e.target.value))),
                    })
                  }
                  className="w-12 rounded-lg border border-input bg-background px-2 py-0.5 text-center text-xs"
                />
                <span className="text-xs text-muted-foreground">violations</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const selectedBatches = allBatches.filter((b) => selectedIds.includes(b.id));

  async function handleSave() {
    if (!test || !educatorId) return;
    if (!selectedBatches.length) {
      toast.error("Select at least one batch");
      return;
    }

    // Validate
    for (const batch of selectedBatches) {
      const cfg = perBatch ? getCfg(batch.id) : globalConfig;
      if (cfg.accessType === "scheduled") {
        if (!cfg.startDate || !cfg.endDate) {
          toast.error(`Set start and end date for ${batch.name}`);
          return;
        }
        const start = new Date(`${cfg.startDate}T${cfg.startTime}`);
        const end = new Date(`${cfg.endDate}T${cfg.endTime}`);
        if (end <= start) {
          toast.error(`End must be after start for ${batch.name}`);
          return;
        }
      } else {
        if (!cfg.code.trim()) {
          toast.error(`Enter a code for ${batch.name}`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      for (const batch of selectedBatches) {
        const cfg = perBatch ? getCfg(batch.id) : globalConfig;
        const ts = serverTimestamp();

        // Upsert: find existing assignment for same testId+batchId to avoid duplicates
        const existingAssignSnap = await getDocs(
          query(
            collection(db, "educators", educatorId, "batchAssignments"),
            where("testId", "==", test.id),
            where("batchId", "==", batch.id)
          )
        );
        const existingAssignDoc = existingAssignSnap.empty ? null : existingAssignSnap.docs[0];

        if (cfg.accessType === "scheduled") {
          const start = Timestamp.fromDate(new Date(`${cfg.startDate}T${cfg.startTime}`));
          const end = Timestamp.fromDate(new Date(`${cfg.endDate}T${cfg.endTime}`));
          const scheduledData = {
            testId: test.id,
            testTitle: test.title || "",
            batchId: batch.id,
            batchName: batch.name,
            accessType: "scheduled",
            startTime: start,
            endTime: end,
            isScheduleActive: cfg.isScheduleActive,
            accessCode: null,
            maxUses: null,
            expiresAt: null,
            windowMinutes: null,
            attemptsAllowed: Number(cfg.attemptsAllowed) || 3,
            examMode: cfg.examMode,
            proctoringConfig: cfg.examMode !== "web" ? cfg.proctoringConfig : null,
            attemptsResetAt: ts,
            updatedAt: ts,
          };
          if (existingAssignDoc) {
            await setDoc(existingAssignDoc.ref, {
              ...scheduledData,
              createdAt: existingAssignDoc.data().createdAt,
            });
          } else {
            await addDoc(collection(db, "educators", educatorId, "batchAssignments"), {
              ...scheduledData,
              createdAt: ts,
            });
          }
        } else {
          const codeUpper = cfg.code.trim().toUpperCase();
          const max = Number(cfg.maxUses) || 100;
          const expiresAt = cfg.expiresAt ? toEndOfDay(cfg.expiresAt) : null;
          const windowMinutes = Number(cfg.windowMinutes) || 0;

          const codeRef = doc(db, "educators", educatorId, "accessCodes", codeUpper);

          if (existingAssignDoc) {
            const existingCode = String(existingAssignDoc.data().accessCode || "");
            if (existingCode !== codeUpper) {
              const newCodeDoc = await getDoc(codeRef);
              if (newCodeDoc.exists()) {
                toast.error(`Code ${codeUpper} already exists — generate a new one`);
                setSaving(false);
                return;
              }
              await setDoc(codeRef, {
                code: codeUpper,
                testSeriesId: test.id,
                testSeriesTitle: test.title || "",
                maxUses: max,
                usesUsed: 0,
                expiresAt,
                windowMinutes,
                createdAt: ts,
              });
            }
          } else {
            const existing = await getDoc(codeRef);
            if (existing.exists()) {
              toast.error(`Code ${codeUpper} already exists — generate a new one`);
              setSaving(false);
              return;
            }
            await setDoc(codeRef, {
              code: codeUpper,
              testSeriesId: test.id,
              testSeriesTitle: test.title || "",
              maxUses: max,
              usesUsed: 0,
              expiresAt,
              windowMinutes,
              createdAt: ts,
            });
          }

          const accessCodeData = {
            testId: test.id,
            testTitle: test.title || "",
            batchId: batch.id,
            batchName: batch.name,
            accessType: "access_code",
            startTime: null,
            endTime: null,
            isScheduleActive: false,
            accessCode: codeUpper,
            maxUses: max,
            expiresAt,
            windowMinutes,
            attemptsAllowed: Number(cfg.attemptsAllowed) || 3,
            examMode: cfg.examMode,
            proctoringConfig: cfg.examMode !== "web" ? cfg.proctoringConfig : null,
            attemptsResetAt: ts,
            updatedAt: ts,
          };
          if (existingAssignDoc) {
            await setDoc(existingAssignDoc.ref, {
              ...accessCodeData,
              createdAt: existingAssignDoc.data().createdAt,
            });
          } else {
            await addDoc(collection(db, "educators", educatorId, "batchAssignments"), {
              ...accessCodeData,
              createdAt: ts,
            });
          }
        }
      }

      await updateDoc(doc(db, "educators", educatorId, "my_tests", test.id), {
        targetBatches: arrayUnion(...selectedBatches.map((b) => b.id)),
        updatedAt: serverTimestamp(),
      });

      toast.success(
        `Assigned to ${selectedBatches.length} batch${selectedBatches.length > 1 ? "es" : ""}`
      );
      handleOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error("Failed to save assignment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 0 ? "Select Test" : step === 1 ? "Select Batches" : "Set Access Method"}
          </DialogTitle>
          {test?.title && <p className="text-sm text-muted-foreground">{test.title}</p>}
        </DialogHeader>

        {/* Step 0: Test picker (when opened from batch panel) */}
        {step === 0 && (
          <div className="space-y-4">
            {allTests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tests available to assign.</p>
            ) : (
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-2">
                {allTests.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedTest(t);
                      setGlobalConfig(defaultConfig(String(t.attemptsAllowed ?? 3)));
                    }}
                    className={`w-full rounded px-2 py-2 text-left text-sm transition-colors hover:bg-muted ${
                      selectedTest?.id === t.id ? "bg-primary/10 font-medium text-primary" : ""
                    }`}
                  >
                    {t.title || "Untitled"}
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => setStep(2)} disabled={!selectedTest}>
                Next →
              </Button>
            </div>
          </div>
        )}

        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {selectedIds.length} of {allBatches.length} selected
              </span>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() =>
                  selectedIds.length === allBatches.length
                    ? setSelectedIds([])
                    : setSelectedIds(allBatches.map((b) => b.id))
                }
              >
                {selectedIds.length === allBatches.length ? "Deselect All" : "Select All"}
              </button>
            </div>

            {allBatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No batches found. Create batches in Divisions first.
              </p>
            ) : (
              <div className="max-h-60 space-y-1 overflow-y-auto rounded-lg border p-2">
                {allBatches.map((b) => (
                  <label
                    key={b.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(b.id)}
                      onChange={() => toggleBatch(b.id)}
                    />
                    <span className="text-sm">{b.label}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => setStep(2)} disabled={selectedIds.length === 0}>
                Next →
              </Button>
            </div>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {selectedBatches.map((b) => (
                <Badge key={b.id} variant="secondary" className="text-xs">
                  {b.name}
                </Badge>
              ))}
            </div>

            {selectedBatches.length > 1 && (
              <div className="flex items-center gap-2">
                <Switch id="per-batch-toggle" checked={perBatch} onCheckedChange={setPerBatch} />
                <Label
                  htmlFor="per-batch-toggle"
                  className="cursor-pointer text-sm text-muted-foreground"
                >
                  Set different per batch
                </Label>
              </div>
            )}

            {!perBatch ? (
              <div className="max-h-[55vh] overflow-y-auto pr-1">
                {renderForm(globalConfig, updateGlobal, "__global")}
              </div>
            ) : (
              <div className="max-h-[360px] space-y-4 overflow-y-auto">
                {selectedBatches.map((b) => (
                  <div key={b.id} className="space-y-3 rounded-xl border p-3">
                    <p className="text-sm font-semibold">{b.name}</p>
                    {renderForm(getCfg(b.id), (f, v) => updatePerBatch(b.id, f, v), b.id)}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              {needsTestPick ? (
                <Button variant="outline" onClick={() => setStep(0)}>
                  ← Back
                </Button>
              ) : !preselectedBatchId ? (
                <Button variant="outline" onClick={() => setStep(1)}>
                  ← Back
                </Button>
              ) : null}
              <div className="ml-auto flex gap-2">
                <Button variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : "Assign & Save"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
