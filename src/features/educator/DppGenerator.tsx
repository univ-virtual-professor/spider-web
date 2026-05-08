import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  limit,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { useEducatorFeatures } from "@shared/hooks/useEducatorFeatures";
import { toast } from "sonner";
import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Label } from "@shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Checkbox } from "@shared/ui/checkbox";
import { Loader2, Lock, Zap, ExternalLink, AlertCircle, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";

type ContentItem = {
  id: string;
  title: string;
  type: string;
  courseId: string;
  courseName: string;
  branchId: string;
  branchName: string;
};

type DppRecord = {
  id: string;
  title: string;
  difficulty: string;
  contentTitles: string[];
  generatedAt: string;
  status: "generating" | "ready" | "failed";
  testId: string | null;
  errorMessage?: string;
};

const MONKEY_KING = import.meta.env.VITE_MONKEY_KING_API_URL || "";

export default function DppGenerator() {
  const { firebaseUser, profile } = useAuth();
  const educatorUid = firebaseUser?.uid || "";
  const { features, loading: featuresLoading } = useEducatorFeatures(educatorUid);

  if (!featuresLoading && !features.dpp) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-8">
        <Lock className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">DPP Generator not included in your plan</h2>
        <p className="text-muted-foreground max-w-sm">Upgrade your plan to generate AI-powered daily practice papers for your students. Contact your admin to enable this feature.</p>
      </div>
    );
  }

  const [content, setContent] = useState<ContentItem[]>([]);
  const [loadingContent, setLoadingContent] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [difficulty, setDifficulty] = useState("medium");
  const [generating, setGenerating] = useState(false);

  const [dpps, setDpps] = useState<DppRecord[]>([]);
  const [usageToday, setUsageToday] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(3);
  const [loadingUsage, setLoadingUsage] = useState(true);

  // Load all content items from educator's courses
  useEffect(() => {
    if (!educatorUid) return;

    async function loadContent() {
      setLoadingContent(true);
      const items: ContentItem[] = [];
      try {
        const branchSnap = await getDocs(collection(db, "educators", educatorUid, "branches"));
        for (const bDoc of branchSnap.docs) {
          const branchName = (bDoc.data() as any).name || bDoc.id;
          const courseSnap = await getDocs(
            collection(db, "educators", educatorUid, "branches", bDoc.id, "courses")
          );
          for (const cDoc of courseSnap.docs) {
            const courseName = (cDoc.data() as any).name || cDoc.id;
            const contentSnap = await getDocs(
              collection(db, "educators", educatorUid, "branches", bDoc.id, "courses", cDoc.id, "content")
            );
            for (const ctDoc of contentSnap.docs) {
              const d = ctDoc.data() as any;
              items.push({
                id: ctDoc.id,
                title: d.title || ctDoc.id,
                type: d.type || "book",
                courseId: cDoc.id,
                courseName,
                branchId: bDoc.id,
                branchName,
              });
            }
          }
        }
      } catch (e) {
        toast.error("Failed to load content");
      }
      setContent(items);
      setLoadingContent(false);
    }

    loadContent();
  }, [educatorUid]);

  // Subscribe to DPP records
  useEffect(() => {
    if (!educatorUid) return;
    const unsub = onSnapshot(
      query(collection(db, "educators", educatorUid, "dpps"), orderBy("generatedAt", "desc"), limit(5)),
      (snap) => setDpps(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );
    return () => unsub();
  }, [educatorUid]);

  // Load usage from monkey-king
  useEffect(() => {
    if (!firebaseUser) return;
    firebaseUser.getIdToken().then((token) => {
      fetch(`${MONKEY_KING}/api/dpp/usage`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => {
          setUsageToday(data.usedToday ?? 0);
          setDailyLimit(data.dailyLimit ?? 3);
        })
        .catch(() => {})
        .finally(() => setLoadingUsage(false));
    });
  }, [firebaseUser, dpps.length]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedContent = content.filter((c) => selectedIds.has(c.id));

  // All selected must be from same course
  const courseIds = [...new Set(selectedContent.map((c) => c.courseId))];
  const courseId = courseIds.length === 1 ? courseIds[0] : "";
  const branchId = selectedContent[0]?.branchId || "";

  const canGenerate =
    selectedIds.size > 0 &&
    courseIds.length === 1 &&
    !generating &&
    usageToday < dailyLimit;

  const handleGenerate = async () => {
    if (!canGenerate || !firebaseUser) return;
    setGenerating(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`${MONKEY_KING}/api/dpp/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          content_ids: [...selectedIds],
          content_titles: selectedContent.map((c) => c.title),
          difficulty,
          course_id: courseId,
          branch_id: branchId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "Generation failed");
      toast.success("DPP generation started — check the list below");
      setSelectedIds(new Set());
      setUsageToday((p) => p + 1);
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate DPP");
    } finally {
      setGenerating(false);
    }
  };

  // Group content by branch > course
  const grouped: Record<string, { courseName: string; items: ContentItem[] }> = {};
  for (const item of content) {
    const key = `${item.branchId}::${item.courseId}`;
    if (!grouped[key]) grouped[key] = { courseName: `${item.branchName} / ${item.courseName}`, items: [] };
    grouped[key].items.push(item);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" /> DPP Generator
        </h1>
        <p className="text-sm text-muted-foreground">
          Select content, pick difficulty, and let Gemini draft a Daily Practice Problem paper
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: content picker + generate */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Select Content</CardTitle>
                {!loadingUsage && (
                  <span className="text-xs text-muted-foreground">
                    {usageToday}/{dailyLimit} used today
                  </span>
                )}
              </div>
              {selectedContent.length > 0 && courseIds.length > 1 && (
                <p className="text-xs text-destructive mt-1">
                  Select content from the same course only
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-4 max-h-96 overflow-y-auto">
              {loadingContent ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : content.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No content uploaded yet. Upload books or notes from the Content section.
                </p>
              ) : (
                Object.entries(grouped).map(([key, group]) => (
                  <div key={key} className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {group.courseName}
                    </p>
                    {group.items.map((item) => (
                      <label
                        key={item.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedIds.has(item.id)}
                          onCheckedChange={() => toggleSelect(item.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.title}</p>
                          <p className="text-xs text-muted-foreground capitalize">{item.type}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-1">
                <Label>Difficulty</Label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedContent.length > 0 && (
                <div className="text-sm text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Selected: {selectedContent.length} item{selectedContent.length !== 1 ? "s" : ""}</p>
                  {selectedContent.map((c) => (
                    <p key={c.id} className="truncate">· {c.title}</p>
                  ))}
                </div>
              )}

              {usageToday >= dailyLimit && (
                <p className="text-sm text-destructive">Daily limit reached ({dailyLimit}/day). Try again tomorrow.</p>
              )}

              <Button
                className="w-full"
                onClick={handleGenerate}
                disabled={!canGenerate}
              >
                {generating ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Generating…</>
                ) : (
                  <><Zap className="h-4 w-4 mr-2" /> Generate DPP</>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right: generated DPPs list */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Generated DPPs</h2>
          {dpps.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                No DPPs generated yet. Select content and click Generate.
              </CardContent>
            </Card>
          ) : (
            dpps.map((dpp) => (
              <Card key={dpp.id}>
                <CardContent className="pt-4 pb-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{dpp.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {dpp.contentTitles?.join(", ") || ""}
                      </p>
                    </div>
                    <StatusBadge status={dpp.status} />
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Badge variant="outline" className="capitalize text-xs">{dpp.difficulty}</Badge>
                    <span>{new Date(dpp.generatedAt).toLocaleString()}</span>
                  </div>

                  {dpp.status === "failed" && dpp.errorMessage && (
                    <p className="text-xs text-destructive">{dpp.errorMessage}</p>
                  )}

                  {dpp.status === "ready" && dpp.testId && (
                    <Link to={`/educator/test-series/${dpp.testId}/questions`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" /> View &amp; Edit Questions
                    </Link>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: DppRecord["status"] }) {
  if (status === "generating") {
    return (
      <Badge variant="secondary" className="gap-1 shrink-0">
        <Loader2 className="h-3 w-3 animate-spin" /> Generating
      </Badge>
    );
  }
  if (status === "ready") {
    return (
      <Badge variant="default" className="gap-1 shrink-0 bg-green-600">
        <CheckCircle2 className="h-3 w-3" /> Ready
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1 shrink-0">
      <AlertCircle className="h-3 w-3" /> Failed
    </Badge>
  );
}
