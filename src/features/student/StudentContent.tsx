import React, { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { useContentTypes } from "@shared/hooks/useContentTypes";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Card, CardContent } from "@shared/ui/card";
import { Input } from "@shared/ui/input";
import {
  BookOpen,
  ExternalLink,
  FileText,
  Loader2,
  Network,
  ScrollText,
  Search,
  Library,
} from "lucide-react";

const TYPE_ICONS: Record<string, React.ElementType> = {
  book: BookOpen,
  note: FileText,
  mindmap: Network,
  formulasheet: ScrollText,
  others: Library,
};

function ContentTypeIcon({ slug }: { slug: string }) {
  const Icon = TYPE_ICONS[slug] ?? FileText;
  return <Icon className="h-5 w-5" />;
}

type ContentItem = {
  id: string;
  type: string;
  title: string;
  description?: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  source: "educator" | "admin_library";
  createdAt: Timestamp;
  sharingScope?: "branch" | "program" | "batch";
  targetBatchId?: string;
  isPublished?: boolean;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StudentContent() {
  const { profile } = useAuth();
  const { activeTypes } = useContentTypes();

  const educatorId: string = profile?.educatorId ?? "";
  const branchId: string = profile?.branchId ?? "";
  const courseId: string = profile?.courseId ?? "";

  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  useEffect(() => {
    if (!educatorId || !branchId || !courseId) {
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(
      query(
        collection(
          db,
          "educators",
          educatorId,
          "branches",
          branchId,
          "courses",
          courseId,
          "content"
        ),
        orderBy("createdAt", "desc")
      ),
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ContentItem, "id">) })));
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [educatorId, branchId, courseId]);

  const studentBatchId = profile?.batchId ?? "";

  const filtered = items.filter((i) => {
    if (i.isPublished === false) return false;
    if (i.sharingScope === "batch" && i.targetBatchId && i.targetBatchId !== studentBatchId) {
      return false;
    }
    if (filterType !== "all" && i.type !== filterType) return false;
    if (search.trim() && !i.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!educatorId || !branchId || !courseId) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Course enrollment information not available.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Content</h1>
        <p className="text-sm text-muted-foreground">Books and notes for your course</p>
      </div>

      {/* Search + filter */}
      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant={filterType === "all" ? "default" : "outline"}
            onClick={() => setFilterType("all")}
          >
            All
          </Button>
          {activeTypes.map((t) => (
            <Button
              key={t.slug}
              size="sm"
              variant={filterType === t.slug ? "default" : "outline"}
              onClick={() => setFilterType(t.slug)}
            >
              {t.name}
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">No content available yet</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <Card key={item.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-muted-foreground">
                    <ContentTypeIcon slug={item.type} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium leading-tight">{item.title}</p>
                    {item.description && (
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {activeTypes.find((t) => t.slug === item.type)?.name ?? item.type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(item.fileSize)}
                    </span>
                  </div>
                  <Button size="sm" variant="outline" asChild>
                    <a href={item.fileUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
