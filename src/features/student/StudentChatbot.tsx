import { useEffect, useRef, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { Button } from "@shared/ui/button";
import { Textarea } from "@shared/ui/textarea";
import { Switch } from "@shared/ui/switch";
import { Label } from "@shared/ui/label";
import { Card, CardContent } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Input } from "@shared/ui/input";
import { Checkbox } from "@shared/ui/checkbox";
import {
  Bot,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  FileText,
  Loader2,
  Lock,
  Send,
  Sparkles,
  Upload,
  X,
  CheckCircle2,
  Zap,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@shared/lib/utils";
import { useEducatorFeatures } from "@shared/hooks/useEducatorFeatures";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

const API_BASE = import.meta.env.VITE_MONKEY_KING_API_URL as string;

type Screen = "setup" | "chat";
type ChatMode = "course" | "upload";

type ContentItem = {
  id: string;
  title: string;
  type: string;
};

type Source = { title: string; excerpt: string };

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

type UploadedFile = {
  name: string;
  context: string;
};

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_IMG_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

const COURSE_SUGGESTIONS = [
  "Explain the key concepts from this topic",
  "What are the most important formulas here?",
  "Give me a quick summary of this chapter",
];

const UPLOAD_SUGGESTIONS = [
  "Summarise what's in this document",
  "What are the key points I should remember?",
  "Explain the hardest concept here simply",
];

function ContentTypeIcon({ type }: { type: string }) {
  if (type === "book") return <BookOpen className="h-4 w-4 shrink-0 text-primary" />;
  return <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code(props) {
            const { children, className, ...rest } = props;
            const isBlock = className?.includes("language-");
            return isBlock ? (
              <pre className="my-2 overflow-x-auto rounded-lg bg-black/10 p-3 text-xs dark:bg-white/10">
                <code className={className} {...rest}>
                  {children}
                </code>
              </pre>
            ) : (
              <code className="rounded bg-black/10 px-1 py-0.5 text-xs dark:bg-white/10" {...rest}>
                {children}
              </code>
            );
          },
          p({ children }) {
            return <p className="mb-2 last:mb-0">{children}</p>;
          },
          ul({ children }) {
            return <ul className="mb-2 list-disc space-y-1 pl-4">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="mb-2 list-decimal space-y-1 pl-4">{children}</ol>;
          },
          h1({ children }) {
            return <h1 className="mb-2 mt-3 text-base font-bold first:mt-0">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="mb-1.5 mt-3 text-sm font-bold first:mt-0">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h3>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="my-2 border-l-2 border-primary/40 pl-3 italic text-muted-foreground">
                {children}
              </blockquote>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function SourceCitations({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);
  if (!sources.length) return null;
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary"
      >
        <BookOpen className="h-3 w-3" />
        {sources.length} source{sources.length > 1 ? "s" : ""}
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {sources.map((s, i) => (
            <div
              key={i}
              className="rounded-lg border-l-2 border-primary/40 bg-muted/60 px-3 py-2 text-xs"
            >
              <p className="font-semibold text-foreground">{s.title}</p>
              <p className="mt-0.5 line-clamp-2 text-muted-foreground">{s.excerpt}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StudentChatbot() {
  const { profile, firebaseUser } = useAuth();
  const educatorId = profile?.educatorId;
  const { features, loading: featuresLoading } = useEducatorFeatures(educatorId);

  const [screen, setScreen] = useState<Screen>("setup");
  const [chatMode, setChatMode] = useState<ChatMode>("course");

  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [loadingContent, setLoadingContent] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [topicContext, setTopicContext] = useState("");

  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [useInternet, setUseInternet] = useState(false);
  const [tokensUsed, setTokensUsed] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(100_000);
  const [limitReached, setLimitReached] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile?.educatorId || !profile?.branchId || !profile?.courseId) return;
    async function loadContent() {
      setLoadingContent(true);
      try {
        const snap = await getDocs(
          collection(
            db,
            "educators",
            profile!.educatorId!,
            "branches",
            profile!.branchId!,
            "courses",
            profile!.courseId!,
            "content"
          )
        );
        setContentItems(
          snap.docs
            .filter((d) => d.data().indexed === true)
            .map((d) => ({
              id: d.id,
              title: d.data().title || d.id,
              type: d.data().type || "book",
            }))
        );
      } catch {
        // non-critical
      } finally {
        setLoadingContent(false);
      }
    }
    loadContent();
  }, [profile?.educatorId, profile?.branchId, profile?.courseId]);

  useEffect(() => {
    (async () => {
      try {
        const token = await firebaseUser?.getIdToken();
        if (!token) return;
        const res = await fetch(`${API_BASE}/api/chat/usage`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setTokensUsed(data.tokensUsedToday ?? 0);
          setDailyLimit(data.dailyLimit ?? 100_000);
          if (data.tokensUsedToday >= data.dailyLimit) setLimitReached(true);
        }
      } catch {
        // non-critical
      }
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  if (!featuresLoading && !features.chatbot) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <Lock className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">AI Tutor not available</h2>
        <p className="max-w-sm text-muted-foreground">
          The AI Doubt Chatbot is not included in your institute's current plan. Contact your
          educator or admin to enable it.
        </p>
      </div>
    );
  }

  const selectedContent = contentItems.filter((c) => selectedIds.has(c.id));

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startChat() {
    if (chatMode === "course" && selectedIds.size === 0) return;
    if (chatMode === "upload" && !uploadedFile) return;
    setMessages([]);
    setScreen("chat");
  }

  function changeContext() {
    setScreen("setup");
    setMessages([]);
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!e.target) return;
    (e.target as HTMLInputElement).value = "";
    if (!file) return;

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/");

    if (!isPdf && !isImage) {
      toast.error("Only PDF and image files are supported");
      return;
    }
    if (isPdf && file.size > MAX_PDF_BYTES) {
      toast.error("PDF must be under 10MB");
      return;
    }
    if (isImage && file.size > MAX_IMG_BYTES) {
      toast.error("Image must be under 5MB");
      return;
    }
    if (isImage && !ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Supported image formats: JPEG, PNG, WebP");
      return;
    }

    setUploading(true);
    setUploadedFile(null);
    try {
      const token = await firebaseUser?.getIdToken();
      if (!token) throw new Error("Not logged in");
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_BASE}/api/chat/extract-upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Extraction failed");
      }
      const data = await res.json();
      setUploadedFile({ name: file.name, context: data.context });
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading || limitReached) return;

    const userMsg: Message = { role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const token = await firebaseUser?.getIdToken();
      if (!token) throw new Error("Not logged in");
      const res = await fetch(`${API_BASE}/api/chat/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: msg,
          use_internet: useInternet,
          history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          content_ids: chatMode === "course" ? [...selectedIds] : [],
          topic_context: chatMode === "course" ? topicContext : "",
          uploaded_context: chatMode === "upload" ? (uploadedFile?.context ?? "") : "",
        }),
      });

      if (res.status === 429) {
        const err = await res.json();
        toast.error(err.detail || "Daily limit reached");
        setLimitReached(true);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Error ${res.status}`);
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          sources: data.contextSources || [],
        },
      ]);
      setTokensUsed(data.totalUsedToday ?? tokensUsed);
      setDailyLimit(data.dailyLimit ?? dailyLimit);
      if (data.totalUsedToday >= data.dailyLimit) setLimitReached(true);
    } catch (e: any) {
      toast.error(e.message || "Failed to get response");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const usagePct = dailyLimit > 0 ? Math.min((tokensUsed / dailyLimit) * 100, 100) : 0;

  const canStart =
    chatMode === "course" ? selectedIds.size > 0 && contentItems.length > 0 : !!uploadedFile;

  const suggestions = chatMode === "upload" ? UPLOAD_SUGGESTIONS : COURSE_SUGGESTIONS;

  // ── Setup Screen ───────────────────────────────────────────────────────────
  if (screen === "setup") {
    return (
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-6 p-4">
        {/* Hero */}
        <div className="relative pt-6 text-center">
          <div className="relative mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl">
            {/* Glow blob */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary to-accent opacity-15 blur-xl" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/15 ring-1 ring-primary/20">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
          </div>
          <h1 className="bg-gradient-to-r from-primary to-accent bg-clip-text text-2xl font-bold text-transparent">
            AI Tutor
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose what to study, then ask anything
          </p>
        </div>

        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setChatMode("course")}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-sm font-medium transition-all duration-200",
              chatMode === "course"
                ? "from-primary/8 to-accent/8 border-primary bg-gradient-to-br text-primary shadow-md shadow-primary/10"
                : "border-border text-muted-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground hover:shadow-md"
            )}
          >
            <BookOpen className={cn("h-5 w-5", chatMode === "course" && "text-primary")} />
            Course content
          </button>
          <button
            onClick={() => setChatMode("upload")}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-sm font-medium transition-all duration-200",
              chatMode === "upload"
                ? "from-primary/8 to-accent/8 border-primary bg-gradient-to-br text-primary shadow-md shadow-primary/10"
                : "border-border text-muted-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground hover:shadow-md"
            )}
          >
            <Upload className={cn("h-5 w-5", chatMode === "upload" && "text-primary")} />
            Upload file
          </button>
        </div>

        <Card className="shadow-[var(--shadow-soft)]">
          <CardContent className="space-y-4 pt-5">
            {chatMode === "course" ? (
              <>
                <div>
                  <p className="mb-2 text-sm font-semibold">Select content to study from</p>
                  {loadingContent ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : contentItems.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No indexed content available yet. Ask your educator to upload course material.
                    </p>
                  ) : (
                    <div className="max-h-60 space-y-1 overflow-y-auto">
                      {contentItems.map((item) => (
                        <label
                          key={item.id}
                          className="flex cursor-pointer items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-muted"
                        >
                          <Checkbox
                            checked={selectedIds.has(item.id)}
                            onCheckedChange={() => toggleSelect(item.id)}
                          />
                          <ContentTypeIcon type={item.type} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{item.title}</p>
                          </div>
                          <Badge variant="outline" className="shrink-0 text-xs capitalize">
                            {item.type}
                          </Badge>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="topic-input" className="text-sm font-semibold">
                    Chapter or topic{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="topic-input"
                    placeholder="e.g. Chapter 3 – Laws of Motion"
                    value={topicContext}
                    onChange={(e) => setTopicContext(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Helps the AI focus on a specific part of the selected content
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-semibold">
                  Upload a PDF or image{" "}
                  <span className="font-normal text-muted-foreground">
                    (PDF ≤ 10MB, image ≤ 5MB)
                  </span>
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFileSelect}
                />

                {!uploadedFile && !uploading && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="hover:bg-primary/3 group flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border p-8 text-muted-foreground transition-all duration-200 hover:border-primary/50 hover:text-foreground"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted transition-colors group-hover:bg-primary/10">
                      <Upload className="h-5 w-5 transition-colors group-hover:text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium">Click to select a file</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">PDF, JPEG, PNG, WebP</p>
                    </div>
                  </button>
                )}

                {uploading && (
                  <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/30 p-8">
                    <div className="relative">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/20" />
                      <Loader2 className="absolute inset-0 m-auto h-5 w-5 animate-spin text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">Extracting content…</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">This may take a moment</p>
                    </div>
                  </div>
                )}

                {uploadedFile && !uploading && (
                  <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 p-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500/10">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{uploadedFile.name}</p>
                      <p className="text-xs text-muted-foreground">Ready to chat</p>
                    </div>
                    <button
                      onClick={() => setUploadedFile(null)}
                      className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {uploadedFile && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Replace file
                  </button>
                )}
              </div>
            )}

            <Button
              className="w-full bg-gradient-to-r from-primary to-accent text-white shadow-md shadow-primary/20 transition-all duration-200 hover:opacity-90 hover:shadow-lg"
              onClick={startChat}
              disabled={!canStart}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Start Asking
            </Button>
          </CardContent>
        </Card>

        {/* Token usage */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Daily usage</span>
            <span>
              {tokensUsed.toLocaleString()} / {dailyLimit.toLocaleString()} tokens
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                usagePct >= 90
                  ? "bg-destructive"
                  : usagePct >= 70
                    ? "bg-amber-500"
                    : "bg-gradient-to-r from-primary to-accent"
              )}
              style={{ width: `${usagePct}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Chat Screen ────────────────────────────────────────────────────────────
  return (
    <div className="flex w-full flex-col pt-3" style={{ minHeight: "calc(100dvh - 6rem)" }}>
      {/* Gradient accent line */}
      <div className="h-0.5 rounded-full bg-gradient-to-r from-primary to-accent" />

      {/* Chat header */}
      <div className="sticky top-3 z-10 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur-sm">
        <button
          onClick={changeContext}
          className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Change
        </button>

        {/* Gradient AI pill */}
        <span className="shrink-0 rounded-full bg-gradient-to-r from-primary to-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          AI
        </span>

        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {chatMode === "upload" ? (
            <Badge variant="secondary" className="max-w-[240px] truncate text-xs">
              <Upload className="mr-1 h-3 w-3 shrink-0" />
              <span className="truncate">{uploadedFile?.name}</span>
            </Badge>
          ) : (
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {selectedContent.map((c) => (
                <Badge key={c.id} variant="secondary" className="max-w-[180px] truncate text-xs">
                  <ContentTypeIcon type={c.type} />
                  <span className="ml-1 truncate">{c.title}</span>
                </Badge>
              ))}
              {topicContext && (
                <Badge variant="outline" className="max-w-[160px] truncate text-xs">
                  {topicContext}
                </Badge>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-muted-foreground" />
          <Switch id="internet-toggle" checked={useInternet} onCheckedChange={setUseInternet} />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-12 text-center">
            {/* Gradient icon */}
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary to-accent opacity-20 blur-xl" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/15 ring-1 ring-primary/20">
                <Bot className="h-7 w-7 text-primary" />
              </div>
            </div>
            <div className="space-y-1 text-muted-foreground">
              {chatMode === "upload" ? (
                <p className="text-sm">
                  Ask anything about{" "}
                  <span className="font-semibold text-foreground">{uploadedFile?.name}</span>
                </p>
              ) : (
                <p className="text-sm">
                  Ask anything about{" "}
                  <span className="font-semibold text-foreground">
                    {selectedContent.map((c) => c.title).join(", ")}
                  </span>
                  {topicContext && (
                    <>
                      {" "}
                      — <span className="font-semibold text-foreground">{topicContext}</span>
                    </>
                  )}
                </p>
              )}
              <p className="text-xs">Try one of these to get started</p>
            </div>
            {/* Suggestion chips */}
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setInput(s);
                    sendMessage(s);
                  }}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5 hover:text-foreground hover:shadow-md"
                >
                  <Zap className="h-3 w-3 text-primary/60" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "flex items-start gap-3 duration-200 animate-in fade-in slide-in-from-bottom-2",
              msg.role === "user" && "flex-row-reverse"
            )}
          >
            {/* Avatar */}
            {msg.role === "assistant" ? (
              <div
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full shadow-sm shadow-primary/20 ring-2 ring-primary/30"
                style={{ background: "var(--gradient-primary)" }}
              >
                <Bot className="h-4 w-4 text-white" />
              </div>
            ) : (
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-border">
                <span className="text-xs font-bold">You</span>
              </div>
            )}

            {/* Bubble */}
            <div
              className={cn(
                "max-w-[60%] rounded-2xl px-4 py-3 text-sm shadow-sm",
                msg.role === "assistant"
                  ? "rounded-tl-sm bg-muted"
                  : "rounded-tr-sm bg-gradient-to-br from-primary to-accent text-white shadow-md shadow-primary/20"
              )}
            >
              {msg.role === "assistant" ? (
                <>
                  <MarkdownMessage content={msg.content} />
                  {msg.sources && msg.sources.length > 0 && (
                    <SourceCitations sources={msg.sources} />
                  )}
                </>
              ) : (
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-start gap-3 duration-200 animate-in fade-in">
            <div
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full shadow-sm shadow-primary/20 ring-2 ring-primary/30"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:300ms]" />
              <span className="ml-1 text-xs text-muted-foreground">Thinking…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area — floating */}
      <div className="px-6 pb-4">
        {limitReached ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-center text-sm text-destructive">
            Daily limit reached for your institute. Access resets tomorrow.
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-background shadow-[var(--shadow-soft)]">
            <div className="flex items-end gap-2 p-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything…"
                disabled={loading}
                className="max-h-[120px] min-h-[40px] flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                rows={1}
              />
              <Button
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                size="icon"
                className="shrink-0 bg-gradient-to-br from-primary to-accent text-white shadow-md shadow-primary/20 transition-all duration-200 hover:opacity-90 disabled:opacity-40"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="px-3 pb-2 text-center text-[11px] text-muted-foreground/60">
              {tokensUsed.toLocaleString()} / {dailyLimit.toLocaleString()} tokens today
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
