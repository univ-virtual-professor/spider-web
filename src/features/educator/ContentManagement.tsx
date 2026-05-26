import React, { useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  updateDoc,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { toast } from "sonner";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Label } from "@shared/ui/label";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  Loader2,
  Lock,
  Plus,
  Trash2,
  ExternalLink,
  BookOpen,
  FileText,
  Network,
  ScrollText,
  Library,
} from "lucide-react";
import { useContentTypes } from "@shared/hooks/useContentTypes";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table";
import { uploadToImageKit, getContentUploadLimit } from "@shared/lib/imagekitUpload";
import type { User } from "firebase/auth";
import { useEducatorFeatures } from "@shared/hooks/useEducatorFeatures";
import { Switch } from "@shared/ui/switch";
import { Checkbox } from "@shared/ui/checkbox";

const MONKEY_KING = import.meta.env.VITE_MONKEY_KING_API_URL as string;

async function triggerIngest(
  payload: {
    file_url: string;
    content_id: string;
    educator_id: string;
    course_id: string;
    branch_id: string;
    title: string;
    content_type: string;
    mime_type: string;
  },
  user: User | null
) {
  try {
    const token = await user?.getIdToken();
    if (!token) return;
    await fetch(`${MONKEY_KING}/api/chat/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  } catch {
    // ingestion is best-effort; don't block the UX
  }
}

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

type Branch = { id: string; name: string };
type Course = { id: string; branchId: string; name: string };
type ContentItem = {
  id: string;
  type: string;
  title: string;
  description?: string;
  fileUrl: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  source: "educator" | "admin_library";
  adminLibraryId?: string;
  addedBy: string;
  createdAt: Timestamp;
  isPublished?: boolean;
  sharingScope?: "branch" | "program" | "batch";
  targetBatchId?: string;
  targetBatchName?: string;
  branchId?: string;
  courseId?: string;
};
type AdminLibraryItem = {
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
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ContentManagement() {
  const { profile, firebaseUser } = useAuth();
  const educatorId = profile?.uid ?? "";
  const { features, loading: featuresLoading } = useEducatorFeatures(educatorId);
  const { activeTypes } = useContentTypes();
  const navigate = useNavigate();

  const fileRef = useRef<HTMLInputElement>(null);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [allowedCourseIds, setAllowedCourseIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadLimitMB, setUploadLimitMB] = useState(20);

  const [selectedBranchId, setSelectedBranchId] = useState("all");
  const [selectedCourseId, setSelectedCourseId] = useState("all");
  const [targetBranchId, setTargetBranchId] = useState("");
  const [batches, setBatches] = useState<
    { id: string; name: string; courseId: string; branchId: string }[]
  >([]);
  const [selectedBatchId, setSelectedBatchId] = useState("all");
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [modalCourseId, setModalCourseId] = useState("");

  const [content, setContent] = useState<ContentItem[]>([]);
  const [contentLoading, setContentLoading] = useState(false);

  const [adminItems, setAdminItems] = useState<AdminLibraryItem[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<string>("book");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!educatorId) return;

    getDoc(doc(db, "educators", educatorId)).then((snap) => {
      if (snap.exists()) {
        setAllowedCourseIds(snap.data().allowedCourseIds ?? []);
      }
    });

    const unsub = onSnapshot(collection(db, "educators", educatorId, "branches"), (snap) => {
      setBranches(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string })));
      setLoading(false);
    });

    getContentUploadLimit().then(setUploadLimitMB);

    return () => unsub();
  }, [educatorId]);

  // Load courses when branches change
  useEffect(() => {
    if (!educatorId || branches.length === 0) {
      setCourses([]);
      return;
    }
    const unsubs = branches.map((branch) =>
      onSnapshot(
        collection(db, "educators", educatorId, "branches", branch.id, "courses"),
        (snap) => {
          const bc = snap.docs.map((d) => ({
            id: d.id,
            branchId: branch.id,
            name: d.data().name as string,
          }));
          setCourses((prev) => [...prev.filter((c) => c.branchId !== branch.id), ...bc]);
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [branches, educatorId]);

  // Load batches when branches and courses load
  useEffect(() => {
    if (!educatorId || branches.length === 0 || courses.length === 0) {
      setBatches([]);
      return;
    }
    const unsubs = courses.map((course) =>
      onSnapshot(
        collection(
          db,
          "educators",
          educatorId,
          "branches",
          course.branchId,
          "courses",
          course.id,
          "batches"
        ),
        (snap) => {
          const cb = snap.docs.map((d) => ({
            id: d.id,
            courseId: course.id,
            branchId: course.branchId,
            name: d.data().name as string,
          }));
          setBatches((prev) => [...prev.filter((b) => b.courseId !== course.id), ...cb]);
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [branches, courses, educatorId]);

  // Load content across courses
  useEffect(() => {
    if (!educatorId || courses.length === 0) {
      setContent([]);
      setContentLoading(false);
      return;
    }

    setContentLoading(true);
    let loadedCount = 0;

    const unsubs = courses.map((course) => {
      return onSnapshot(
        query(
          collection(
            db,
            "educators",
            educatorId,
            "branches",
            course.branchId,
            "courses",
            course.id,
            "content"
          ),
          orderBy("createdAt", "desc")
        ),
        (snap) => {
          const docs = snap.docs.map((d) => ({
            id: d.id,
            branchId: course.branchId,
            courseId: course.id,
            ...(d.data() as Omit<ContentItem, "id" | "branchId" | "courseId">),
          }));

          setContent((prev) => {
            const filtered = prev.filter((item) => item.courseId !== course.id);
            const combined = [...filtered, ...docs];
            return combined.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
          });

          loadedCount++;
          if (loadedCount >= courses.length) {
            setContentLoading(false);
          }
        },
        (error) => {
          console.error("Failed to fetch content for course", course.id, error);
          loadedCount++;
          if (loadedCount >= courses.length) setContentLoading(false);
        }
      );
    });

    return () => unsubs.forEach((u) => u());
  }, [educatorId, courses]);

  if (!featuresLoading && !features.contentLibrary) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <Lock className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Content Library not included in your plan</h2>
        <p className="max-w-sm text-muted-foreground">
          Upgrade your plan to upload and manage books, notes, and course content. Contact your
          admin to enable this feature.
        </p>
      </div>
    );
  }

  async function openImport() {
    const libSnap = await getDocs(
      query(collection(db, "admin_library"), orderBy("createdAt", "desc"))
    );
    const all = libSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<AdminLibraryItem, "id">),
    }));

    if (allowedCourseIds.length === 0) {
      // No restriction — show everything
      setAdminItems(all);
    } else {
      // Resolve subjects that belong to the educator's allowed courses
      const subjectSnap = await getDocs(
        query(collection(db, "subjects"), where("courseId", "in", allowedCourseIds))
      );
      const allowedSubjectIds = subjectSnap.docs.map((d) => d.id);
      setAdminItems(all.filter((i) => allowedSubjectIds.includes(i.subjectId)));
    }
    const initBranch =
      selectedBranchId !== "all" ? selectedBranchId : branches.length === 1 ? branches[0].id : "";
    setTargetBranchId(initBranch);

    const branchCourses = courses.filter((c) => c.branchId === initBranch);
    const initCourse =
      selectedCourseId !== "all"
        ? selectedCourseId
        : branchCourses.length === 1
          ? branchCourses[0].id
          : "";
    setModalCourseId(initCourse);

    const courseBatches = batches.filter((b) => b.courseId === initCourse);
    setSelectedBatches(initCourse && courseBatches.length === 1 ? [courseBatches[0].id] : []);

    setImportOpen(true);
  }

  async function handleImport(item: AdminLibraryItem) {
    const branchIdToUse = selectedBranchId !== "all" ? selectedBranchId : targetBranchId;
    if (!branchIdToUse) return toast.error("Select a branch");

    const courseIdToUse = modalCourseId;
    if (!courseIdToUse) return toast.error("Select a program");

    const courseBatches = batches.filter((b) => b.courseId === courseIdToUse);
    const finalSharingScope =
      courseBatches.length > 0 && selectedBatches.length > 0 ? "batch" : "branch";

    setImportBusy(true);
    try {
      await addDoc(
        collection(
          db,
          "educators",
          educatorId,
          "branches",
          branchIdToUse,
          "courses",
          courseIdToUse,
          "content"
        ),
        {
          type: item.type,
          title: item.title,
          description: item.description ?? null,
          fileUrl: item.fileUrl,
          fileId: item.fileId,
          fileName: item.fileName,
          fileSize: item.fileSize,
          mimeType: item.mimeType,
          source: "admin_library",
          adminLibraryId: item.id,
          addedBy: educatorId,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          isPublished: true,
          indexed: false,
          sharingScope: finalSharingScope,
          targetBatches: finalSharingScope === "batch" ? selectedBatches : [],
          targetBatchId: finalSharingScope === "batch" ? selectedBatches[0] : null,
          targetBatchName:
            finalSharingScope === "batch"
              ? (batches.find((b) => b.id === selectedBatches[0])?.name ?? "")
              : null,
        }
      );
      toast.success(`"${item.title}" added to course`);
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    } finally {
      setImportBusy(false);
    }
  }

  function cascadeModalBranch(branchId: string) {
    setTargetBranchId(branchId);
    const branchCourses = courses.filter((c) => c.branchId === branchId);
    const autoCourse = branchCourses.length === 1 ? branchCourses[0].id : "";
    setModalCourseId(autoCourse);
    const courseBatches = batches.filter((b) => b.courseId === autoCourse);
    setSelectedBatches(autoCourse && courseBatches.length === 1 ? [courseBatches[0].id] : []);
  }

  function cascadeModalCourse(courseId: string) {
    setModalCourseId(courseId);
    const courseBatches = batches.filter((b) => b.courseId === courseId);
    setSelectedBatches(courseBatches.length === 1 ? [courseBatches[0].id] : []);
  }

  function openUpload() {
    setFile(null);
    setTitle("");
    setDescription("");
    setType("note");
    if (fileRef.current) fileRef.current.value = "";

    const initBranch =
      selectedBranchId !== "all" ? selectedBranchId : branches.length === 1 ? branches[0].id : "";
    setTargetBranchId(initBranch);

    const branchCourses = courses.filter((c) => c.branchId === initBranch);
    const initCourse =
      selectedCourseId !== "all"
        ? selectedCourseId
        : branchCourses.length === 1
          ? branchCourses[0].id
          : "";
    setModalCourseId(initCourse);

    const courseBatches = batches.filter((b) => b.courseId === initCourse);
    setSelectedBatches(initCourse && courseBatches.length === 1 ? [courseBatches[0].id] : []);

    setUploadOpen(true);
  }

  async function handleUpload() {
    const branchIdToUse = selectedBranchId !== "all" ? selectedBranchId : targetBranchId;
    if (!branchIdToUse) return toast.error("Select a branch");

    const courseIdToUse = modalCourseId;
    if (!courseIdToUse) return toast.error("Select a program");

    if (!title.trim()) return toast.error("Title required");
    if (!file) return toast.error("File required");

    const limitBytes = uploadLimitMB * 1024 * 1024;
    if (file.size > limitBytes) {
      return toast.error(`File exceeds ${uploadLimitMB} MB limit`);
    }

    setUploadBusy(true);
    try {
      const result = await uploadToImageKit(
        file,
        file.name,
        `/content/educator/${educatorId}`,
        "content"
      );

      const courseBatches = batches.filter((b) => b.courseId === courseIdToUse);
      const finalSharingScope =
        courseBatches.length > 0 && selectedBatches.length > 0 ? "batch" : "branch";

      const ref = await addDoc(
        collection(
          db,
          "educators",
          educatorId,
          "branches",
          branchIdToUse,
          "courses",
          courseIdToUse,
          "content"
        ),
        {
          type,
          title: title.trim(),
          description: description.trim() || null,
          fileUrl: result.url,
          fileId: result.fileId,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          source: "educator",
          addedBy: educatorId,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          isPublished: true,
          indexed: false,
          sharingScope: finalSharingScope,
          targetBatches: finalSharingScope === "batch" ? selectedBatches : [],
          targetBatchId: finalSharingScope === "batch" ? selectedBatches[0] : null,
          targetBatchName:
            finalSharingScope === "batch"
              ? (batches.find((b) => b.id === selectedBatches[0])?.name ?? "")
              : null,
        }
      );

      // Best-effort: index the file for AI chatbot (non-blocking)
      triggerIngest(
        {
          file_url: result.url,
          content_id: ref.id,
          educator_id: educatorId,
          course_id: courseIdToUse,
          branch_id: branchIdToUse,
          title: title.trim(),
          content_type: type,
          mime_type: file.type,
        },
        firebaseUser ?? null
      );

      toast.success("Content added");
      setUploadOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploadBusy(false);
    }
  }

  async function handleDelete(item: ContentItem) {
    if (!confirm(`Delete "${item.title}"?`)) return;
    try {
      await deleteDoc(
        doc(
          db,
          "educators",
          educatorId,
          "branches",
          item.branchId!, // ✅ use item's own branchId
          "courses",
          item.courseId!, // ✅ use item's own courseId
          "content",
          item.id
        )
      );
      toast.success("Deleted");
    } catch (e: any) {
      toast.error(e?.message || "Delete failed");
    }
  }

  async function handleTogglePublish(item: ContentItem, published: boolean) {
    try {
      await updateDoc(
        doc(
          db,
          "educators",
          educatorId,
          "branches",
          item.branchId!, // ✅ use item's own branchId
          "courses",
          item.courseId!, // ✅ use item's own courseId
          "content",
          item.id
        ),
        {
          isPublished: published,
          updatedAt: Timestamp.now(),
        }
      );
      toast.success(published ? "Content published" : "Content unpublished");
    } catch (e: any) {
      toast.error(e?.message || "Failed to update status");
    }
  }

  const displayedContent = content.filter((item) => {
    if (selectedBranchId !== "all" && item.branchId !== selectedBranchId) return false;
    if (selectedCourseId !== "all" && item.courseId !== selectedCourseId) return false;

    if (selectedBatchId === "all") return true;
    if (item.sharingScope === "branch" || item.sharingScope === "program") return true;
    if (item.sharingScope === "batch") {
      if ((item as any).targetBatches?.includes(selectedBatchId)) return true;
      if (item.targetBatchId === selectedBatchId) return true;
    }
    return false;
  });

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-4">
        <div
          className="flex cursor-pointer items-center rounded-full p-2 transition-colors hover:bg-primary hover:text-white"
          onClick={() => navigate("/educator/dashboard")}
        >
          <ArrowLeft />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Content</h1>
          <p className="text-sm text-muted-foreground">Manage books and notes per course</p>
        </div>
      </div>

      {/* Course selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Course</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Select
            value={selectedBranchId}
            onValueChange={(v) => {
              setSelectedBranchId(v);
              setSelectedCourseId("all");
              setSelectedBatchId("all");
            }}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All Branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedCourseId}
            onValueChange={(v) => {
              setSelectedCourseId(v);
              setSelectedBatchId("all");
            }}
            disabled={!selectedBranchId}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All Programs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Programs</SelectItem>
              {courses
                .filter((c) => selectedBranchId === "all" || c.branchId === selectedBranchId)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All Batches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Batches</SelectItem>
              {batches
                .filter((b) =>
                  selectedCourseId === "all"
                    ? selectedBranchId === "all" || b.branchId === selectedBranchId
                    : b.courseId === selectedCourseId
                )
                .map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          {(selectedBranchId !== "all" ||
            selectedCourseId !== "all" ||
            selectedBatchId !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedBranchId("all");
                setSelectedCourseId("all");
                setSelectedBatchId("all");
              }}
            >
              Reset
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Content list */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">
            Content{" "}
            {selectedCourseId === "all"
              ? "— All Programs"
              : `— ${courses.find((c) => c.id === selectedCourseId)?.name}`}
          </CardTitle>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button variant="outline" size="sm" onClick={openImport}>
              <Library className="mr-2 h-4 w-4" /> Import from Library
            </Button>
            <Button size="sm" onClick={openUpload}>
              <Plus className="mr-2 h-4 w-4" /> Add Content
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {contentLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : displayedContent.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">No content yet</div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedContent.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.title}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          <ContentTypeIcon slug={item.type} />
                          {activeTypes.find((t) => t.slug === item.type)?.name ?? item.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.source === "admin_library" ? "outline" : "secondary"}>
                          {item.source === "admin_library" ? "Admin Library" : "Own"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.sharingScope === "branch" ? (
                          <Badge
                            variant="outline"
                            className="border-blue-500 bg-blue-500/10 text-blue-500"
                          >
                            Branch
                          </Badge>
                        ) : item.sharingScope === "batch" ? (
                          <Badge
                            variant="outline"
                            className="border-purple-500 bg-purple-500/10 text-purple-500"
                          >
                            {(item as any).targetBatches?.length > 1
                              ? `Batches (${(item as any).targetBatches.length})`
                              : `Batch: ${item.targetBatchName || "Specific"}`}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-emerald-500 bg-emerald-500/10 text-emerald-500"
                          >
                            Program
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatBytes(item.fileSize)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.createdAt?.toDate().toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={item.isPublished !== false}
                          onCheckedChange={(val) => handleTogglePublish(item, val)}
                        />
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Content</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {branches.length > 1 && selectedBranchId === "all" && (
              <div className="space-y-1">
                <Label>Branch</Label>
                <Select value={targetBranchId} onValueChange={cascadeModalBranch}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(() => {
              const branchId = selectedBranchId !== "all" ? selectedBranchId : targetBranchId;
              if (!branchId) return null;
              const branchCourses = courses.filter((c) => c.branchId === branchId);
              if (branchCourses.length <= 1) return null;
              return (
                <div className="space-y-1">
                  <Label>Program</Label>
                  <Select value={modalCourseId} onValueChange={cascadeModalCourse}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a program" />
                    </SelectTrigger>
                    <SelectContent>
                      {branchCourses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })()}

            {(() => {
              if (!modalCourseId) return null;
              const courseBatches = batches.filter((b) => b.courseId === modalCourseId);
              if (courseBatches.length <= 1) return null;
              return (
                <div className="space-y-2">
                  <Label>Batch</Label>
                  <div className="flex flex-col gap-2 rounded-md border p-3">
                    {courseBatches.map((b) => (
                      <label key={b.id} className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedBatches.includes(b.id)}
                          onCheckedChange={(checked) => {
                            if (checked) setSelectedBatches((prev) => [...prev, b.id]);
                            else setSelectedBatches((prev) => prev.filter((id) => id !== b.id));
                          }}
                        />
                        <span className="text-sm font-medium">{b.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="space-y-1">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Chapter 1 Notes"
              />
            </div>

            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select Type" />
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
            <Button className="w-full" onClick={handleUpload} disabled={uploadBusy}>
              {uploadBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Upload
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import from admin library dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Import from Admin Library</DialogTitle>
          </DialogHeader>

          <div className="mb-4 space-y-3 border-b pb-4">
            {branches.length > 1 && selectedBranchId === "all" && (
              <div className="space-y-1">
                <Label>Branch</Label>
                <Select value={targetBranchId} onValueChange={cascadeModalBranch}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(() => {
              const branchId = selectedBranchId !== "all" ? selectedBranchId : targetBranchId;
              if (!branchId) return null;
              const branchCourses = courses.filter((c) => c.branchId === branchId);
              if (branchCourses.length <= 1) return null;
              return (
                <div className="space-y-1">
                  <Label>Program</Label>
                  <Select value={modalCourseId} onValueChange={cascadeModalCourse}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a program" />
                    </SelectTrigger>
                    <SelectContent>
                      {branchCourses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })()}

            {(() => {
              if (!modalCourseId) return null;
              const courseBatches = batches.filter((b) => b.courseId === modalCourseId);
              if (courseBatches.length <= 1) return null;
              return (
                <div className="space-y-2">
                  <Label>Batch</Label>
                  <div className="flex flex-col gap-2 rounded-md border p-3">
                    {courseBatches.map((b) => (
                      <label key={b.id} className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedBatches.includes(b.id)}
                          onCheckedChange={(checked) => {
                            if (checked) setSelectedBatches((prev) => [...prev, b.id]);
                            else setSelectedBatches((prev) => prev.filter((id) => id !== b.id));
                          }}
                        />
                        <span className="text-sm font-medium">{b.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {adminItems.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No admin content available for your assigned courses
            </p>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adminItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.title}</TableCell>
                      <TableCell>{item.subjectName}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          <ContentTypeIcon slug={item.type} />
                          {activeTypes.find((t) => t.slug === item.type)?.name ?? item.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={importBusy}
                          onClick={() => handleImport(item)}
                        >
                          Add
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
