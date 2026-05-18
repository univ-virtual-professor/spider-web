import React, { useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { toast } from "sonner";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Card, CardContent } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Label } from "@shared/ui/label";
import {
  Loader2,
  Plus,
  Trash2,
  ExternalLink,
  BookOpen,
  FileText,
  Network,
  ScrollText,
  RefreshCw,
  Library,
} from "lucide-react";
import { useContentTypes } from "@shared/hooks/useContentTypes";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table";
import { uploadToImageKit, getContentUploadLimit } from "@shared/lib/imagekitUpload";

type Course = { id: string; name: string };
type Subject = { id: string; name: string; courseId?: string };
const TYPE_ICONS: Record<string, React.ElementType> = {
  book: BookOpen,
  note: FileText,
  mindmap: Network,
  formulasheet: ScrollText,
  others: Library,
};

function ContentTypeIcon({ slug }: { slug: string }) {
  const Icon = TYPE_ICONS[slug] ?? FileText;
  return <Icon className="mr-1 h-3 w-3" />;
}

type ContentItem = {
  id: string;
  type: string;
  title: string;
  description?: string;
  subjectId: string;
  subjectName: string;
  fileUrl: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  createdAt: Timestamp;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ContentLibrary() {
  const { profile } = useAuth();
  const { activeTypes } = useContentTypes();
  const fileRef = useRef<HTMLInputElement>(null);

  const [courses, setCourses] = useState<Course[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterCourse, setFilterCourse] = useState("all");
  const [filterSubject, setFilterSubject] = useState("all");
  const [filterType, setFilterType] = useState("all");

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploadLimitMB, setUploadLimitMB] = useState(100);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [uploadCourseId, setUploadCourseId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [type, setType] = useState<string>("book");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    getDocs(query(collection(db, "courses"), orderBy("name"))).then((snap) => {
      setCourses(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string })));
    });
    getDocs(query(collection(db, "subjects"), orderBy("name"))).then((snap) => {
      setSubjects(
        snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name as string,
          courseId: d.data().courseId as string | undefined,
        }))
      );
    });

    const unsub = onSnapshot(
      query(collection(db, "admin_library"), orderBy("createdAt", "desc")),
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ContentItem, "id">) })));
        setLoading(false);
      }
    );

    getContentUploadLimit().then(setUploadLimitMB);

    return () => unsub();
  }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_MONKEY_KING_API_URL}/api/chat/ingest-pending`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_MONKEY_KING_ADMIN_KEY}`,
          },
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Sync failed");
      toast.success(
        `Sync complete — ${data.succeeded} indexed, ${data.failed} failed, ${data.skipped} skipped`
      );
    } catch (e: any) {
      toast.error(e?.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  function openUploadDialog() {
    setTitle("");
    setDescription("");
    setUploadCourseId("");
    setSubjectId("");
    setType("book");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    setOpen(true);
  }

  async function handleUpload() {
    if (!title.trim()) return toast.error("Title required");
    if (!subjectId) return toast.error("Subject required");
    if (!file) return toast.error("File required");

    const limitBytes = uploadLimitMB * 1024 * 1024;
    if (file.size > limitBytes) {
      return toast.error(`File exceeds ${uploadLimitMB} MB limit`);
    }

    setBusy(true);
    try {
      const subject = subjects.find((s) => s.id === subjectId);
      const result = await uploadToImageKit(file, file.name, `/content/admin`, "content");

      await addDoc(collection(db, "admin_library"), {
        type,
        title: title.trim(),
        description: description.trim() || null,
        subjectId,
        subjectName: subject?.name ?? "",
        fileUrl: result.url,
        fileId: result.fileId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        uploadedBy: profile?.uid ?? "",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      toast.success("Content uploaded");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(item: ContentItem) {
    if (!confirm(`Delete "${item.title}"?`)) return;
    try {
      await deleteDoc(doc(db, "admin_library", item.id));
      toast.success("Deleted");
    } catch (e: any) {
      toast.error(e?.message || "Delete failed");
    }
  }

  // Subjects visible in filter dropdown (scoped to selected course)
  const visibleSubjects =
    filterCourse === "all" ? subjects : subjects.filter((s) => s.courseId === filterCourse);

  // Subjects available in upload dialog (scoped to selected upload course)
  const uploadSubjects = uploadCourseId
    ? subjects.filter((s) => s.courseId === uploadCourseId)
    : subjects;

  // IDs of subjects under the selected filter course (for course-level filtering)
  const courseSubjectIds =
    filterCourse === "all"
      ? null
      : new Set(subjects.filter((s) => s.courseId === filterCourse).map((s) => s.id));

  const filtered = items.filter((i) => {
    if (courseSubjectIds && !courseSubjectIds.has(i.subjectId)) return false;
    if (filterSubject !== "all" && i.subjectId !== filterSubject) return false;
    if (filterType !== "all" && i.type !== filterType) return false;
    return true;
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Content Library</h1>
          <p className="text-sm text-muted-foreground">
            Books and notes visible to educators by subject
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSync} disabled={syncing}>
            {syncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync Library
          </Button>
          <Button onClick={openUploadDialog}>
            <Plus className="mr-2 h-4 w-4" /> Upload Content
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select
          value={filterCourse}
          onValueChange={(v) => {
            setFilterCourse(v);
            setFilterSubject("all");
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Courses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Courses</SelectItem>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterSubject} onValueChange={setFilterSubject}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Subjects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Subjects</SelectItem>
            {visibleSubjects.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {activeTypes.map((t) => (
              <SelectItem key={t.slug} value={t.slug}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No content found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.title}</TableCell>
                    <TableCell>{item.subjectName}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        <ContentTypeIcon slug={item.type} />
                        {activeTypes.find((t) => t.slug === item.type)?.name ?? item.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatBytes(item.fileSize)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.createdAt?.toDate().toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" asChild>
                          <a href={item.fileUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(item)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Content</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Class 11 Physics Notes"
              />
            </div>

            <div className="space-y-1">
              <Label>Description (optional)</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description"
              />
            </div>

            <div className="space-y-1">
              <Label>Course</Label>
              <Select
                value={uploadCourseId}
                onValueChange={(v) => {
                  setUploadCourseId(v);
                  setSubjectId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select course" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Subject</Label>
              <Select
                value={subjectId}
                onValueChange={setSubjectId}
                disabled={uploadSubjects.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      uploadSubjects.length === 0 ? "Select a course first" : "Select subject"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {uploadSubjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activeTypes.map((t) => (
                    <SelectItem key={t.slug} value={t.slug}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>
                File <span className="text-xs text-muted-foreground">(max {uploadLimitMB} MB)</span>
              </Label>
              <input
                ref={fileRef}
                type="file"
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <Button className="w-full" onClick={handleUpload} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Upload
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
