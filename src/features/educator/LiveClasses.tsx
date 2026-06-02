import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  Timestamp,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { toast } from "sonner";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@shared/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Label } from "@shared/ui/label";
import { Badge } from "@shared/ui/badge";
import { Textarea } from "@shared/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@shared/ui/dialog";
import { Checkbox } from "@shared/ui/checkbox";
import {
  ArrowLeft,
  Calendar,
  Plus,
  Trash2,
  VideoOff,
  Loader2,
  Users,
  Tv,
  Edit2,
  PlayCircle,
  Youtube,
  UserCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Branch = { id: string; name: string };
type Course = { id: string; branchId: string; name: string };
type Batch = { id: string; branchId: string; courseId: string; name: string };

type LiveClass = {
  id: string;
  title: string;
  branchId: string;
  branchName: string;
  courseId: string;
  courseName: string;
  batchId: string;
  batchName: string;
  date: string;
  time: string;
  description?: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  scheduledTimestamp: Timestamp;
  educatorId: string;
  status: "scheduled" | "live" | "completed";
  enableAttendance: boolean;
  enableChat: boolean;
  recordStream: boolean;
  notifyStudents: boolean;
  createdAt: Timestamp;
  enrolledCount?: number;
};

// YouTube Link Parser Helper
function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|live\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  if (match && match[2].length === 11) {
    return match[2];
  }
  const trimmed = url.trim();
  if (trimmed.length === 11) {
    return trimmed;
  }
  return null;
}

export default function LiveClasses() {
  const { profile, firebaseUser } = useAuth();
  const educatorId = profile?.uid || firebaseUser?.uid || "";
  const navigate = useNavigate();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [liveClasses, setLiveClasses] = useState<LiveClass[]>([]);

  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [activeTab, setActiveTab] = useState<"scheduled" | "live" | "completed">("scheduled");

  // YouTube Connection Mock State
  const [ytConnected, setYtConnected] = useState<boolean>(() => {
    return localStorage.getItem("yt_connected") === "true";
  });
  const [connectingYt, setConnectingYt] = useState(false);

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Form Cascade State
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState("");

  // Schedule Form State
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  // Stream setup Form State
  const [manualYoutubeUrl, setManualYoutubeUrl] = useState("");
  const [autoCreateStream, setAutoCreateStream] = useState(true);

  // Advanced options Form State
  const [enableAttendance, setEnableAttendance] = useState(true);
  const [enableChat, setEnableChat] = useState(true);
  const [recordStream, setRecordStream] = useState(true);
  const [notifyStudents, setNotifyStudents] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal Views State
  const [selectedWatchClass, setSelectedWatchClass] = useState<LiveClass | null>(null);
  const [selectedAttendanceClass, setSelectedAttendanceClass] = useState<LiveClass | null>(null);
  const [editingClass, setEditingClass] = useState<LiveClass | null>(null);

  // Edit Form Fields State
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editYtUrl, setEditYtUrl] = useState("");
  const [updating, setUpdating] = useState(false);

  // Student Counts by Batch
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});

  // Fetch batches and count traversal (same as BatchesListing)
  useEffect(() => {
    if (!educatorId) return;

    // Branches snapshot
    const unsubBranches = onSnapshot(collection(db, "educators", educatorId, "branches"), (snap) =>
      setBranches(snap.docs.map((d) => ({ id: d.id, name: d.data().name })))
    );

    // Live Classes snapshot
    const unsubClasses = onSnapshot(
      query(
        collection(db, "educators", educatorId, "liveClasses"),
        orderBy("scheduledTimestamp", "asc")
      ),
      (snap) => {
        setLiveClasses(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<LiveClass, "id">),
          }))
        );
        setLoading(false);
      },
      (err) => {
        console.error(err);
        toast.error("Failed to load live classes");
        setLoading(false);
      }
    );

    // Fetch students list to compute enrolled count per batch
    const unsubStudents = onSnapshot(
      collection(db, "educators", educatorId, "students"),
      (snap) => {
        const counts: Record<string, number> = {};
        snap.docs.forEach((d) => {
          const bid = String(d.data()?.batchId || "");
          if (bid) counts[bid] = (counts[bid] || 0) + 1;
        });
        setStudentCounts(counts);
      }
    );

    return () => {
      unsubBranches();
      unsubClasses();
      unsubStudents();
    };
  }, [educatorId]);

  useEffect(() => {
    if (!educatorId || branches.length === 0) {
      setCourses([]);
      return;
    }
    const unsubs = branches.map((branch) =>
      onSnapshot(
        collection(db, "educators", educatorId, "branches", branch.id, "courses"),
        (snap) => {
          const branchCourses = snap.docs.map((d) => ({
            id: d.id,
            branchId: branch.id,
            name: d.data().name,
          }));
          setCourses((prev) => [...prev.filter((c) => c.branchId !== branch.id), ...branchCourses]);
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [branches, educatorId]);

  useEffect(() => {
    if (!educatorId || courses.length === 0) {
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
          const courseBatches = snap.docs.map((d) => ({
            id: d.id,
            branchId: course.branchId,
            courseId: course.id,
            name: d.data().name,
          }));
          setBatches((prev) => [
            ...prev.filter((b) => !(b.courseId === course.id && b.branchId === course.branchId)),
            ...courseBatches,
          ]);
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [courses, educatorId]);

  // Filtering lists by cascade
  const filteredCourses = useMemo(() => {
    return courses.filter((c) => c.branchId === selectedBranchId);
  }, [courses, selectedBranchId]);

  const filteredBatches = useMemo(() => {
    return batches.filter(
      (b) => b.courseId === selectedCourseId && b.branchId === selectedBranchId
    );
  }, [batches, selectedCourseId, selectedBranchId]);

  // Status-based lists
  const filteredClasses = useMemo(() => {
    return liveClasses.filter((item) => item.status === activeTab);
  }, [liveClasses, activeTab]);

  // Statistics Computations
  const stats = useMemo(() => {
    const total = liveClasses.length;
    const upcoming = liveClasses.filter((c) => c.status === "scheduled").length;
    const live = liveClasses.filter((c) => c.status === "live").length;
    const completed = liveClasses.filter((c) => c.status === "completed").length;
    return { total, upcoming, live, completed };
  }, [liveClasses]);

  const handleCopyLink = (link: string, id: string) => {
    navigator.clipboard.writeText(link);
    setCopiedId(id);
    toast.success("YouTube link copied!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const connectYoutube = async () => {
    setConnectingYt(true);
    try {
      const response = await fetch("http://localhost:8000/youtube/auth-url");

      const data = await response.json();
      console.log(data);

      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error("Failed to connect YouTube", error);
      toast.error("Failed to connect YouTube.");
    } finally {
      setConnectingYt(false);
    }
  };

  const handleDisconnectYouTube = async () => {
    setYtConnected(false);
    localStorage.removeItem("yt_connected");
    toast.success("Disconnected YouTube account.");
  };

  const handleCreateLiveClass = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error("Please enter a title");
      return;
    }
    if (!selectedBranchId || !selectedCourseId || !selectedBatchId) {
      toast.error("Please select branch, program, and batch audience");
      return;
    }
    if (!date) {
      toast.error("Please select a date");
      return;
    }
    if (!time) {
      toast.error("Please select a time");
      return;
    }

    let finalYtUrl = manualYoutubeUrl.trim();
    let finalYtId = "";

    if (ytConnected && autoCreateStream) {
      // Mock automatic live stream creation using standard YouTube video ID
      finalYtId = "5qap5aO4i9A"; // Mock static video ID
      finalYtUrl = `https://www.youtube.com/watch?v=${finalYtId}`;
    } else {
      if (!finalYtUrl) {
        toast.error("Please provide a YouTube Live stream link");
        return;
      }
      const extracted = extractYouTubeId(finalYtUrl);
      if (!extracted) {
        toast.error("Invalid YouTube URL. Please verify the URL.");
        return;
      }
      finalYtId = extracted;
    }

    setSubmitting(true);
    try {
      const branchName = branches.find((b) => b.id === selectedBranchId)?.name || "";
      const courseName = courses.find((c) => c.id === selectedCourseId)?.name || "";
      const batchName = batches.find((b) => b.id === selectedBatchId)?.name || "";
      const enrolledCount = studentCounts[selectedBatchId] || 0;

      // Parse schedule timestamp
      const scheduledDate = new Date(`${date}T${time}:00`);
      const scheduledTimestamp = Timestamp.fromDate(scheduledDate);

      const classPayload = {
        title: title.trim(),
        branchId: selectedBranchId,
        branchName,
        courseId: selectedCourseId,
        courseName,
        batchId: selectedBatchId,
        batchName,
        date,
        time,
        description: description.trim(),
        youtubeUrl: finalYtUrl,
        youtubeVideoId: finalYtId,
        scheduledTimestamp,
        educatorId,
        status: "scheduled",
        enableAttendance,
        enableChat,
        recordStream,
        notifyStudents,
        enrolledCount,
        createdAt: Timestamp.now(),
      };

      await addDoc(collection(db, "educators", educatorId, "liveClasses"), classPayload);
      toast.success("Live Class scheduled successfully!");

      // Reset form states
      setTitle("");
      setDescription("");
      setSelectedBranchId("");
      setSelectedCourseId("");
      setSelectedBatchId("");
      setDate("");
      setTime("");
      setManualYoutubeUrl("");
      setShowCreateForm(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to schedule Live Class");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (classId: string, newStatus: "live" | "completed") => {
    try {
      await updateDoc(doc(db, "educators", educatorId, "liveClasses", classId), {
        status: newStatus,
      });
      toast.success(newStatus === "live" ? "Class is now LIVE!" : "Live Class ended.");
      if (newStatus === "live") {
        setActiveTab("live");
      } else {
        setActiveTab("completed");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to update class status");
    }
  };

  const handleDeleteClass = async (classId: string, title: string) => {
    if (!confirm(`Are you sure you want to cancel the Live Class "${title}"?`)) return;

    try {
      await deleteDoc(doc(db, "educators", educatorId, "liveClasses", classId));
      toast.success("Live Class deleted");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete live class");
    }
  };

  const handleEditClick = (c: LiveClass) => {
    setEditingClass(c);
    setEditTitle(c.title);
    setEditDescription(c.description || "");
    setEditYtUrl(c.youtubeUrl);
  };

  const handleUpdateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClass) return;

    if (!editTitle.trim()) {
      toast.error("Please enter a title");
      return;
    }

    const ytId = extractYouTubeId(editYtUrl);
    if (!editYtUrl.trim()) {
      toast.error("Please provide a YouTube Live link");
      return;
    }
    if (!ytId) {
      toast.error("Invalid YouTube link format");
      return;
    }

    setUpdating(true);
    try {
      await updateDoc(doc(db, "educators", educatorId, "liveClasses", editingClass.id), {
        title: editTitle.trim(),
        description: editDescription.trim(),
        youtubeUrl: editYtUrl.trim(),
        youtubeVideoId: ytId,
      });
      toast.success("Live class updated");
      setEditingClass(null);
    } catch (err) {
      console.error(err);
      toast.error("Update failed");
    } finally {
      setUpdating(false);
    }
  };

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatTimeLabel = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(":");
    const hr = parseInt(hours);
    const ampm = hr >= 12 ? "PM" : "AM";
    const formattedHr = hr % 12 || 12;
    return `${formattedHr}:${minutes} ${ampm}`;
  };

  // Mock Attendance List generator
  const mockAttendance = [
    { name: "Aarav Sharma", status: "Joined", time: "05:01 PM" },
    { name: "Neha Patel", status: "Joined", time: "05:03 PM" },
    { name: "Rohan Das", status: "Joined", time: "05:00 PM" },
    { name: "Ananya Sen", status: "Joined", time: "05:05 PM" },
    { name: "Vihaan Gupta", status: "Absent", time: "—" },
    { name: "Priya Reddy", status: "Joined", time: "05:02 PM" },
    { name: "Kabir Singh", status: "Joined", time: "05:12 PM" },
  ];

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative space-y-6">
      <AnimatePresence mode="wait">
        {!showCreateForm ? (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Live Classes</h1>
                <p className="hidden text-sm text-muted-foreground md:block">
                  Schedule, broadcast, and track attendance of live classes
                </p>
              </div>
              <Button
                onClick={() => setShowCreateForm(true)}
                className="gradient-bg rounded-lg shadow-sm"
              >
                <Plus className="mr-2 h-4 w-4" /> Create Live Class
              </Button>
            </div>

            {/* Tabs & Filters */}
            <div className="border-b border-border">
              <div className="flex space-x-6">
                {(["scheduled", "live", "completed"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`relative pb-3 text-sm font-semibold capitalize transition-colors ${
                      activeTab === tab
                        ? "border-b-2 border-primary text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab === "scheduled" ? "Upcoming" : tab}
                    {liveClasses.filter((c) => c.status === tab).length > 0 && (
                      <span
                        className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${
                          tab === "live"
                            ? "animate-pulse bg-red-500/10 text-red-600"
                            : tab === "scheduled"
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {liveClasses.filter((c) => c.status === tab).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Dashboard Cards List */}
            {filteredClasses.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-20 text-center shadow-soft">
                <VideoOff className="mb-4 h-12 w-12 text-muted-foreground/40" />
                <h2 className="text-lg font-semibold">No Live Classes Found</h2>
                <p className="mt-2 max-w-xs text-sm text-muted-foreground">
                  {activeTab === "scheduled"
                    ? "Schedule a new live class program to start streaming to your batches."
                    : activeTab === "live"
                      ? "There are no classes live right now."
                      : "No completed classes found."}
                </p>
                {activeTab === "scheduled" && (
                  <Button onClick={() => setShowCreateForm(true)} className="mt-6">
                    Create First Live Class
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {filteredClasses.map((item) => (
                  <Card
                    key={item.id}
                    className="relative flex flex-col justify-between overflow-hidden border-border/50 shadow-soft transition-all duration-200 hover:border-primary/30 hover:shadow-card"
                  >
                    {item.status === "live" && (
                      <div className="absolute left-0 top-0 h-[3.5px] w-full animate-pulse bg-red-500" />
                    )}
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <CardTitle className="line-clamp-2 truncate text-base font-bold leading-tight">
                            {item.title}
                          </CardTitle>
                          <Badge variant="outline" className="bg-muted/40 text-xs font-medium">
                            {item.batchName}
                          </Badge>
                        </div>
                        {item.status === "live" ? (
                          <Badge className="flex shrink-0 items-center gap-1.5 rounded-full border-none bg-red-500/10 px-2.5 py-0.5 text-[10px] font-bold text-red-600 hover:bg-red-500/10">
                            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-red-500" />
                            LIVE
                          </Badge>
                        ) : item.status === "scheduled" ? (
                          <Badge className="shrink-0 rounded-full border-none bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-bold text-blue-600">
                            SCHEDULED
                          </Badge>
                        ) : (
                          <Badge className="shrink-0 rounded-full border-none bg-green-500/10 px-2.5 py-0.5 text-[10px] font-bold text-green-600">
                            COMPLETED
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pb-4">
                      {item.description && (
                        <p className="line-clamp-2 h-8 text-xs leading-relaxed text-muted-foreground">
                          {item.description}
                        </p>
                      )}

                      <div className="space-y-1.5 border-t border-border/40 pt-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-primary/65" />
                          <span>{formatDateLabel(item.date)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-primary/65" />
                          <span>{item.enrolledCount || 0} students enrolled</span>
                        </div>
                      </div>

                      {/* Card Footer Actions depending on status */}
                      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/30 pt-3">
                        {item.status === "scheduled" && (
                          <>
                            <Button
                              size="sm"
                              className="gradient-bg py-4.5 flex-1 rounded-lg text-xs"
                              onClick={() => handleUpdateStatus(item.id, "live")}
                            >
                              <PlayCircle className="mr-1.5 h-4 w-4" />
                              Start Live
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9 rounded-lg border-border px-3"
                              title="Edit Class"
                              onClick={() => handleEditClick(item)}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-9 shrink-0 rounded-lg px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => handleDeleteClass(item.id, item.title)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}

                        {item.status === "live" && (
                          <>
                            <Button
                              size="sm"
                              className="py-4.5 flex-1 rounded-lg bg-red-600 text-xs hover:bg-red-700"
                              onClick={() => setSelectedWatchClass(item)}
                            >
                              <Tv className="mr-1.5 h-4 w-4" />
                              Join Studio
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="py-4.5 flex-1 rounded-lg border-red-200 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                              onClick={() => handleUpdateStatus(item.id, "completed")}
                            >
                              End Class
                            </Button>
                          </>
                        )}

                        {item.status === "completed" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 rounded-lg border-border text-xs"
                              onClick={() => setSelectedWatchClass(item)}
                            >
                              <Tv className="h-3.5 w-3.5 text-primary" />
                              View Recording
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 rounded-lg border-border text-xs"
                              onClick={() => setSelectedAttendanceClass(item)}
                            >
                              <UserCheck className="h-3.5 w-3.5 text-primary" />
                              Attendance
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
            className="mx-auto max-w-2xl"
          >
            {/* Back header */}
            <div className="mb-6 flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowCreateForm(false)}
                className="rounded-full hover:bg-muted"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h2 className="text-xl font-bold tracking-tight">Create Live Class</h2>
                <p className="text-sm text-muted-foreground">
                  Setup and schedule a virtual live classroom
                </p>
              </div>
            </div>

            <Card className="border-border/60 shadow-card">
              <CardContent className="space-y-8 p-6">
                <form onSubmit={handleCreateLiveClass} className="space-y-8">
                  {/* Section 1: Basic Details */}
                  <div className="space-y-4">
                    <h3 className="flex items-center gap-2 border-b pb-2 text-sm font-bold text-primary">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px]">
                        1
                      </span>
                      Basic Details
                    </h3>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="title" className="text-xs font-bold text-foreground">
                          Class Title <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="title"
                          placeholder="e.g. React Hooks Deep Dive"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          className="rounded-lg border-input bg-card py-5 focus:ring-primary"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="description" className="text-xs font-bold text-foreground">
                          Description (Optional)
                        </Label>
                        <Textarea
                          id="description"
                          placeholder="Add class description..."
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          className="min-h-[100px] rounded-lg border-input bg-card focus:ring-primary"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Audience */}
                  <div className="space-y-4">
                    <h3 className="flex items-center gap-2 border-b pb-2 text-sm font-bold text-primary">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px]">
                        2
                      </span>
                      Audience Selection
                    </h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-foreground">
                          Branch <span className="text-red-500">*</span>
                        </Label>
                        <Select
                          value={selectedBranchId}
                          onValueChange={(val) => {
                            setSelectedBranchId(val);
                            setSelectedCourseId("");
                            setSelectedBatchId("");
                          }}
                        >
                          <SelectTrigger className="rounded-lg border-input bg-card py-5">
                            <SelectValue placeholder="Select Branch" />
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

                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-foreground">
                          Program <span className="text-red-500">*</span>
                        </Label>
                        <Select
                          value={selectedCourseId}
                          onValueChange={(val) => {
                            setSelectedCourseId(val);
                            setSelectedBatchId("");
                          }}
                          disabled={!selectedBranchId}
                        >
                          <SelectTrigger className="rounded-lg border-input bg-card py-5">
                            <SelectValue placeholder="Select Program" />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredCourses.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-foreground">
                          Batch <span className="text-red-500">*</span>
                        </Label>
                        <Select
                          value={selectedBatchId}
                          onValueChange={setSelectedBatchId}
                          disabled={!selectedCourseId}
                        >
                          <SelectTrigger className="rounded-lg border-input bg-card py-5">
                            <SelectValue placeholder="Select Batch" />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredBatches.map((b) => (
                              <SelectItem key={b.id} value={b.id}>
                                {b.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Schedule */}
                  <div className="space-y-4">
                    <h3 className="flex items-center gap-2 border-b pb-2 text-sm font-bold text-primary">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px]">
                        3
                      </span>
                      Schedule
                    </h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="date" className="text-xs font-bold text-foreground">
                          Date <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="date"
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          className="rounded-lg border-input bg-card py-5 focus:ring-primary"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="time" className="text-xs font-bold text-foreground">
                          Time <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="time"
                          type="time"
                          value={time}
                          onChange={(e) => setTime(e.target.value)}
                          className="rounded-lg border-input bg-card py-5 focus:ring-primary"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section 4: Streaming Setup */}
                  <div className="space-y-4">
                    <h3 className="flex items-center gap-2 border-b pb-2 text-sm font-bold text-primary">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px]">
                        4
                      </span>
                      Streaming Setup
                    </h3>

                    {!ytConnected ? (
                      <Card className="flex flex-col gap-4 rounded-xl border-amber-200 bg-amber-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <h4 className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
                            <Youtube className="h-5 w-5 shrink-0 text-red-600" />
                            YouTube Account Not Connected
                          </h4>
                          <p className="max-w-md text-xs leading-normal text-amber-700/90">
                            Connect your YouTube channel to automatically create and manage live
                            streams for your classes.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={connectingYt}
                          onClick={connectYoutube}
                          className="shrink-0 self-start border-amber-300 bg-amber-100/50 text-amber-900 hover:bg-amber-100 sm:self-center"
                        >
                          {connectingYt ? (
                            <>
                              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            "Connect YouTube"
                          )}
                        </Button>
                      </Card>
                    ) : (
                      <div className="space-y-4">
                        <Card className="flex flex-col gap-4 rounded-xl border-green-200 bg-green-50/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white shadow-sm">
                              PK
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <h4 className="truncate text-sm font-bold text-green-950">
                                  PrepareKaro Live Channel
                                </h4>
                                <Badge className="shrink-0 rounded-full border-none bg-green-500/10 px-2 py-0 text-[9px] font-extrabold text-green-600 hover:bg-green-500/10">
                                  CONNECTED
                                </Badge>
                              </div>
                              <p className="truncate text-xs text-green-700/80">
                                youtube.com/c/preparekarolive
                              </p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleDisconnectYouTube}
                            className="shrink-0 text-xs text-destructive hover:bg-destructive/10"
                          >
                            Disconnect
                          </Button>
                        </Card>

                        <div className="flex items-center space-x-2 rounded-lg border border-border/40 bg-muted/30 p-3">
                          <Checkbox
                            id="autoCreateStream"
                            checked={autoCreateStream}
                            onCheckedChange={(checked) => setAutoCreateStream(!!checked)}
                          />
                          <label
                            htmlFor="autoCreateStream"
                            className="cursor-pointer select-none text-xs font-semibold text-foreground"
                          >
                            Automatically create YouTube Live stream
                          </label>
                        </div>
                      </div>
                    )}

                    {(!ytConnected || !autoCreateStream) && (
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="manualYoutubeUrl"
                          className="text-xs font-bold text-foreground"
                        >
                          Manual YouTube Live Stream URL <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="manualYoutubeUrl"
                          placeholder="e.g. https://www.youtube.com/watch?v=..."
                          value={manualYoutubeUrl}
                          onChange={(e) => setManualYoutubeUrl(e.target.value)}
                          className="rounded-lg border-input bg-card py-5 focus:ring-primary"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 border-t border-border/40 pt-6">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-28 rounded-lg"
                      onClick={() => setShowCreateForm(false)}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="gradient-bg rounded-lg text-white shadow-soft"
                      disabled={submitting}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scheduling...
                        </>
                      ) : (
                        "Create Live Class"
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Live Class Dialog */}
      <Dialog open={!!editingClass} onOpenChange={(open) => !open && setEditingClass(null)}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Edit Live Class Details</DialogTitle>
            <DialogDescription>
              Modify fields and save updates to the scheduled live class.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateClass} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="editTitle" className="text-xs font-bold">
                Class Title
              </Label>
              <Input
                id="editTitle"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="editYtUrl" className="text-xs font-bold">
                YouTube URL
              </Label>
              <Input
                id="editYtUrl"
                value={editYtUrl}
                onChange={(e) => setEditYtUrl(e.target.value)}
                className="rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="editDesc" className="text-xs font-bold">
                Description
              </Label>
              <Textarea
                id="editDesc"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <Button type="button" variant="outline" onClick={() => setEditingClass(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updating} className="gradient-bg text-white">
                {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Watch Stream Dialog */}
      <Dialog
        open={!!selectedWatchClass}
        onOpenChange={(open) => !open && setSelectedWatchClass(null)}
      >
        <DialogContent className="max-w-3xl rounded-xl">
          <DialogHeader>
            <DialogTitle className="truncate text-lg font-bold">
              {selectedWatchClass?.title}
            </DialogTitle>
            <CardDescription>
              Batch: {selectedWatchClass?.batchName} · Program: {selectedWatchClass?.courseName}
            </CardDescription>
          </DialogHeader>
          {selectedWatchClass?.youtubeVideoId && (
            <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-black shadow-md">
              <iframe
                src={`https://www.youtube.com/embed/${selectedWatchClass.youtubeVideoId}?autoplay=1`}
                title={selectedWatchClass.title}
                className="absolute inset-0 h-full w-full border-none"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
          {selectedWatchClass?.description && (
            <div className="mt-2 max-h-[150px] space-y-1 overflow-y-auto pr-1">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                Description
              </h4>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {selectedWatchClass.description}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View Attendance Dialog */}
      <Dialog
        open={!!selectedAttendanceClass}
        onOpenChange={(open) => !open && setSelectedAttendanceClass(null)}
      >
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Class Attendance Report</DialogTitle>
            <CardDescription className="line-clamp-1">
              {selectedAttendanceClass?.title} · Batch: {selectedAttendanceClass?.batchName}
            </CardDescription>
          </DialogHeader>
          <div className="mt-4 divide-y overflow-hidden rounded-lg border bg-card">
            <div className="flex bg-muted/30 px-4 py-2 text-xs font-bold text-muted-foreground">
              <span className="flex-1">Student Name</span>
              <span className="w-24 text-right">Status</span>
              <span className="w-24 text-right">Join Time</span>
            </div>
            {mockAttendance.map((student, idx) => (
              <div key={idx} className="flex items-center px-4 py-2.5 text-xs">
                <span className="flex-1 font-semibold text-foreground">{student.name}</span>
                <span className="w-24 text-right">
                  <Badge
                    variant={student.status === "Joined" ? "secondary" : "outline"}
                    className={
                      student.status === "Joined"
                        ? "border-none bg-green-100 text-green-700 hover:bg-green-100"
                        : "text-muted-foreground"
                    }
                  >
                    {student.status}
                  </Badge>
                </span>
                <span className="w-24 text-right text-muted-foreground">{student.time}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-end pt-3">
            <Button variant="outline" size="sm" onClick={() => setSelectedAttendanceClass(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
