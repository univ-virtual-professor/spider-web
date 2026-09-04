import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sparkles, Target, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@app/providers/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@shared/ui/tabs";
import { Slider } from "@shared/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";

import {
  getPersonalizedFilters,
  generatePersonalizedTest,
  type WeakAreaFilter,
} from "./practice/api";

type NavState = { subject?: string; chapter?: string; topic?: string } | null;

export default function PracticeGenerator() {
  const { firebaseUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = (location.state as NavState) || null;

  const [mode, setMode] = useState<"auto" | "custom">(prefill ? "custom" : "auto");
  const [subject, setSubject] = useState<string>(prefill?.subject || "");
  const [chapter, setChapter] = useState<string>(prefill?.chapter || "");
  const [topic, setTopic] = useState<string>(prefill?.topic || "");
  const [difficulty, setDifficulty] = useState<string>("");
  const [questionCount, setQuestionCount] = useState(20);

  const { data, isLoading } = useQuery({
    queryKey: ["personalizedFilters", firebaseUser?.uid],
    queryFn: async () => {
      const token = await firebaseUser?.getIdToken();
      if (!token) throw new Error("Not authenticated");
      return getPersonalizedFilters(token);
    },
    enabled: !!firebaseUser,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const token = await firebaseUser?.getIdToken();
      if (!token) throw new Error("Not authenticated");
      return generatePersonalizedTest(token, {
        mode,
        subject: subject || undefined,
        chapters: chapter ? [chapter] : [],
        topics: topic ? [topic] : [],
        difficulty: difficulty || undefined,
        question_count: questionCount,
      });
    },
    onSuccess: (res) => {
      toast.success("Practice test ready!");
      navigate(`/student/tests/${res.testId}/attempt`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not generate a practice test");
    },
  });

  const subjectOptions = useMemo(() => Object.keys(data?.filterTree || {}).sort(), [data]);
  const chapterOptions = useMemo(
    () => (subject ? data?.filterTree?.[subject]?.chapters || [] : []),
    [data, subject]
  );
  const topicOptions = useMemo(
    () => (subject ? data?.filterTree?.[subject]?.topics || [] : []),
    [data, subject]
  );

  const weakAreas: WeakAreaFilter[] = data?.weakAreas || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Practice for Me</h1>
        <p className="text-sm text-muted-foreground">
          A quick practice test built from a light weighted-sampling algorithm — no AI, just your
          weak spots (or filters you pick) matched against the question bank.
        </p>
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as "auto" | "custom")}>
        <TabsList>
          <TabsTrigger value="auto" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Auto (from weak areas)
          </TabsTrigger>
          <TabsTrigger value="custom" className="gap-2">
            <Target className="h-4 w-4" />
            Custom
          </TabsTrigger>
        </TabsList>

        <TabsContent value="auto" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Your current weak areas</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : weakAreas.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No weak areas identified yet — take a few more tests, or switch to Custom mode to
                  practice a specific subject.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {weakAreas.slice(0, 12).map((a, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {(a.topic || a.chapter || a.subject) as string}
                      <span className="ml-1 text-muted-foreground">
                        {Math.round(a.weighted_accuracy * 100)}%
                      </span>
                    </Badge>
                  ))}
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                The generator allocates more questions to weaker areas automatically — you don't
                need to pick them individually.
              </p>
              {subjectOptions.length > 0 && (
                <div className="mt-4 max-w-xs">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Restrict to subject (optional)
                  </label>
                  <Select
                    value={subject || "any"}
                    onValueChange={(v) => setSubject(v === "any" ? "" : v)}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Any subject" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any subject</SelectItem>
                      {subjectOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="custom" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Pick what to practice</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Subject
                </label>
                <Select
                  value={subject || undefined}
                  onValueChange={(v) => {
                    setSubject(v);
                    setChapter("");
                    setTopic("");
                  }}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjectOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Chapter (optional)
                </label>
                <Select
                  value={chapter || "any"}
                  onValueChange={(v) => setChapter(v === "any" ? "" : v)}
                  disabled={!subject}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Any chapter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any chapter</SelectItem>
                    {chapterOptions.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Topic (optional)
                </label>
                <Select
                  value={topic || "any"}
                  onValueChange={(v) => setTopic(v === "any" ? "" : v)}
                  disabled={!subject}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Any topic" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any topic</SelectItem>
                    {topicOptions.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-3">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Difficulty (optional)
                </label>
                <Select
                  value={difficulty || "any"}
                  onValueChange={(v) => setDifficulty(v === "any" ? "" : v)}
                >
                  <SelectTrigger className="h-9 w-40 text-sm">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">Number of questions</span>
              <span className="text-muted-foreground">{questionCount}</span>
            </div>
            <Slider
              value={[questionCount]}
              onValueChange={([v]) => setQuestionCount(v)}
              min={10}
              max={50}
              step={5}
            />
          </div>

          <Button
            className="w-full gap-2"
            size="lg"
            disabled={generateMutation.isPending || (mode === "custom" && !subject)}
            onClick={() => generateMutation.mutate()}
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Practice Test
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
