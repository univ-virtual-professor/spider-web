import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@app/providers/AuthProvider";
import { useAccessibleCourses } from "@shared/hooks/useAccessibleCourses";
import { useQBOptions } from "@shared/hooks/useQBOptions";
import { MultiSelect } from "@shared/ui/MultiSelect";
import { toast } from "sonner";
import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Label } from "@shared/ui/label";
import { ArrowLeft, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";

const MONKEY_KING = import.meta.env.VITE_MONKEY_KING_API_URL || "";

type Section = {
  name: string;
  questionCount: number;
  format: string;
  topicFilters: string[];
  subjectFilters: string[];
};

type Template = {
  title: string;
  sections: Section[];
  positiveMarks: number;
  negativeMarks: number;
  durationMinutes: number;
  instructions: string;
};

const DEFAULT_SECTION: Section = {
  name: "Section A",
  questionCount: 10,
  format: "single_correct_mcq",
  topicFilters: [],
  subjectFilters: [],
};

const FORMATS = [
  { value: "single_correct_mcq", label: "Single Correct MCQ" },
  { value: "multicorrect_mcq", label: "Multi-Correct MCQ" },
  { value: "subjective", label: "Short Answer" },
  { value: "subjective_long", label: "Long Answer" },
];

export default function DppTemplatePage() {
  const { firebaseUser } = useAuth();
  const navigate = useNavigate();
  const educatorUid = firebaseUser?.uid || "";
  const { subjects, allowedSubjectIds } = useAccessibleCourses(educatorUid);
  const { topics } = useQBOptions(allowedSubjectIds.length ? allowedSubjectIds : undefined);
  const subjectOptions = useMemo(() => subjects.map((s) => s.name), [subjects]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [hasCustom, setHasCustom] = useState(false);

  const [title, setTitle] = useState("My DPP Template");
  const [sections, setSections] = useState<Section[]>([{ ...DEFAULT_SECTION }]);
  const [positiveMarks, setPositiveMarks] = useState(4);
  const [negativeMarks, setNegativeMarks] = useState(-1);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [instructions, setInstructions] = useState("Attempt all questions.");

  const totalQuestions = sections.reduce((a, s) => a + (s.questionCount || 0), 0);

  async function apiFetch(path: string, opts: RequestInit = {}) {
    const token = await firebaseUser?.getIdToken();
    return fetch(`${MONKEY_KING}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...opts.headers,
      },
    });
  }

  useEffect(() => {
    if (!firebaseUser) return;
    setLoading(true);
    apiFetch("/api/dpp/template/my")
      .then((r) => r.json())
      .then((d) => {
        const tmpl: Template = d.template || {};
        setHasCustom(!!d.hasCustom);
        setTitle(tmpl.title || "My DPP Template");
        setSections(
          (tmpl.sections || [{ ...DEFAULT_SECTION }]).map((s: any) => ({
            name: s.name || "Section A",
            questionCount: s.questionCount || 10,
            format: s.format || "single_correct_mcq",
            topicFilters: s.topicFilters || [],
            subjectFilters: s.subjectFilters || (s.subjectFilter ? [s.subjectFilter] : []),
          }))
        );
        setPositiveMarks(tmpl.positiveMarks ?? 4);
        setNegativeMarks(tmpl.negativeMarks ?? -1);
        setDurationMinutes(tmpl.durationMinutes ?? 30);
        setInstructions(tmpl.instructions || "Attempt all questions.");
      })
      .catch(() => toast.error("Failed to load template"))
      .finally(() => setLoading(false));
  }, [firebaseUser]);

  const updateSection = (i: number, patch: Partial<Section>) =>
    setSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const addSection = () => {
    if (sections.length >= 5) {
      toast.error("Maximum 5 sections allowed");
      return;
    }
    setSections((prev) => [
      ...prev,
      { ...DEFAULT_SECTION, name: `Section ${String.fromCharCode(65 + prev.length)}` },
    ]);
  };

  const removeSection = (i: number) => {
    if (sections.length <= 1) {
      toast.error("At least one section is required");
      return;
    }
    setSections((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    if (totalQuestions < 1) {
      toast.error("Add at least one question");
      return;
    }
    if (totalQuestions > 100) {
      toast.error("Total questions cannot exceed 100");
      return;
    }
    if (durationMinutes < 5 || durationMinutes > 180) {
      toast.error("Duration must be between 5 and 180 minutes");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/dpp/template/my", {
        method: "PUT",
        body: JSON.stringify({
          title,
          sections,
          positiveMarks,
          negativeMarks,
          durationMinutes,
          instructions,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "Save failed");
      setHasCustom(true);
      toast.success("DPP template saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset to the global default template? Your customizations will be deleted."))
      return;
    setResetting(true);
    try {
      const res = await apiFetch("/api/dpp/template/my", { method: "DELETE" });
      if (!res.ok) throw new Error("Reset failed");
      // Reload global defaults
      const r2 = await apiFetch("/api/dpp/template/my");
      const d = await r2.json();
      const tmpl: Template = d.template || {};
      setTitle(tmpl.title || "Standard DPP");
      setSections(
        (tmpl.sections || [{ ...DEFAULT_SECTION }]).map((s: any) => ({
          name: s.name || "Section A",
          questionCount: s.questionCount || 10,
          format: s.format || "single_correct_mcq",
          topicFilters: s.topicFilters || [],
          subjectFilters: s.subjectFilters || (s.subjectFilter ? [s.subjectFilter] : []),
        }))
      );
      setPositiveMarks(tmpl.positiveMarks ?? 4);
      setNegativeMarks(tmpl.negativeMarks ?? -1);
      setDurationMinutes(tmpl.durationMinutes ?? 30);
      setInstructions(tmpl.instructions || "Attempt all questions.");
      setHasCustom(false);
      toast.success("Reset to global default");
    } catch (e: any) {
      toast.error("Failed to reset template");
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/educator/dpp")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">My DPP Template</h1>
          <p className="text-sm text-muted-foreground">
            {hasCustom ? "Using your custom template" : "Using global default — customize below"}
          </p>
        </div>
      </div>

      {/* Title + Duration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basic Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Template name</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Duration (min)</Label>
              <Input
                type="number"
                min={5}
                max={180}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label>+ve Marks</Label>
              <Input
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={positiveMarks}
                onChange={(e) => setPositiveMarks(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label>−ve Marks</Label>
              <Input
                type="number"
                min={-5}
                max={0}
                step={0.25}
                value={negativeMarks}
                onChange={(e) => setNegativeMarks(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Instructions</Label>
            <Input
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={500}
              placeholder="Attempt all questions."
            />
          </div>
        </CardContent>
      </Card>

      {/* Sections */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Sections
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {totalQuestions} questions total
                {totalQuestions > 100 && <span className="ml-1 text-destructive">(max 100)</span>}
              </span>
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={addSection}
              disabled={sections.length >= 5}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Section
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {sections.map((sec, i) => (
            <div key={i} className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Section {i + 1}</span>
                {sections.length > 1 && (
                  <button
                    onClick={() => removeSection(i)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Section name</Label>
                  <Input
                    value={sec.name}
                    onChange={(e) => updateSection(i, { name: e.target.value })}
                    maxLength={50}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Questions</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={sec.questionCount}
                    onChange={(e) => updateSection(i, { questionCount: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Format</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={sec.format}
                  onChange={(e) => updateSection(i, { format: e.target.value })}
                >
                  {FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">
                    Subject filter{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <MultiSelect
                    options={subjectOptions}
                    selected={sec.subjectFilters}
                    onChange={(vals) => updateSection(i, { subjectFilters: vals })}
                    placeholder="Select subjects…"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    Topic filter{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <MultiSelect
                    options={topics}
                    selected={sec.topicFilters}
                    onChange={(vals) => updateSection(i, { topicFilters: vals })}
                    placeholder="Select topics…"
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving || totalQuestions > 100}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" /> Save Template
            </>
          )}
        </Button>
        {hasCustom && (
          <Button variant="outline" onClick={handleReset} disabled={resetting}>
            {resetting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-2 h-4 w-4" />
            )}
            Reset to Default
          </Button>
        )}
      </div>
    </div>
  );
}
