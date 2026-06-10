import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  Timestamp,
  orderBy,
  query,
  updateDoc,
  getDocs,
  where,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { toast } from "sonner";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
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
import {
  ArrowLeft,
  Calendar,
  Plus,
  VideoOff,
  Loader2,
  Tv,
  Edit2,
  Youtube,
  Clock,
  Key,
  Copy,
  Eye,
  EyeOff,
  HelpCircle,
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
  scheduledDate: string;
  startTime: string;
  description?: string;
  watchUrl: string;
  scheduledTimestamp: Timestamp;
  educatorId: string;
  status: "scheduled" | "live" | "completed";
  enableAttendance: boolean;
  enableChat: boolean;
  recordStream: boolean;
  notifyStudents: boolean;
  createdAt: Timestamp;
  enrolledCount?: number;
  youtubeRtmpUrl?: string;
  youtubeStreamKey?: string;
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
  const [ytConnected, setYtConnected] = useState<{ connected: boolean; channelName: string }>({
    connected: false,
    channelName: "",
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

  // Advanced options Form State
  const [enableAttendance, setEnableAttendance] = useState(true);
  const [enableChat, setEnableChat] = useState(true);
  const [recordStream, setRecordStream] = useState(true);
  const [notifyStudents, setNotifyStudents] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal Views State
  const [selectedAttendanceClass, setSelectedAttendanceClass] = useState<LiveClass | null>(null);
  const [editingClass, setEditingClass] = useState<LiveClass | null>(null);
  const [credentialsModal, setCredentialsModal] = useState<{
    rtmpUrl: string;
    streamKey: string;
  } | null>(null);
  const [showStreamKey, setShowStreamKey] = useState(false);

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

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
        collection(db, "live_classes"),
        where("educatorId", "==", educatorId),
        orderBy("createdAt", "desc")
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
    const now = new Date();
    return liveClasses.filter((item) => {
      let scheduledDate: Date | null = null;
      if (item.scheduledTimestamp) {
        if (typeof item.scheduledTimestamp.toDate === "function") {
          scheduledDate = item.scheduledTimestamp.toDate();
        } else if ((item.scheduledTimestamp as any).seconds) {
          scheduledDate = new Date((item.scheduledTimestamp as any).seconds * 1000);
        }
      } else if (item.scheduledDate) {
        scheduledDate = new Date(item.scheduledDate);
      }

      const isPast = scheduledDate && !isNaN(scheduledDate.getTime()) && now >= scheduledDate;

      if (activeTab === "live") {
        return item.status === "live" || (item.status === "scheduled" && isPast);
      }
      if (activeTab === "scheduled") {
        return item.status === "scheduled" && !isPast;
      }
      return item.status === activeTab;
    });
  }, [liveClasses, activeTab]);

  // Statistics Computations
  const stats = useMemo(() => {
    const now = new Date();
    const total = liveClasses.length;
    let upcoming = 0;
    let live = 0;
    let completed = 0;

    liveClasses.forEach((item) => {
      let scheduledDate: Date | null = null;
      if (item.scheduledTimestamp) {
        if (typeof item.scheduledTimestamp.toDate === "function") {
          scheduledDate = item.scheduledTimestamp.toDate();
        } else if ((item.scheduledTimestamp as any).seconds) {
          scheduledDate = new Date((item.scheduledTimestamp as any).seconds * 1000);
        }
      } else if (item.scheduledDate) {
        scheduledDate = new Date(item.scheduledDate);
      }

      const isPast = scheduledDate && !isNaN(scheduledDate.getTime()) && now >= scheduledDate;

      if (item.status === "completed") {
        completed++;
      } else if (item.status === "live" || (item.status === "scheduled" && isPast)) {
        live++;
      } else {
        upcoming++;
      }
    });

    return { total, upcoming, live, completed };
  }, [liveClasses]);

  const connectYoutube = async () => {
    setConnectingYt(true);
    try {
      const tSnap = await getDocs(
        query(collection(db, "tenants"), where("educatorId", "==", educatorId))
      );
      let tenantSlug = "";
      if (!tSnap.empty) {
        tenantSlug = tSnap.docs[0].data().slug || tSnap.docs[0].id;
      }

      const response = await fetch(
        `http://localhost:8000/youtube/auth-url?educatorId=${educatorId}&slug=${tenantSlug}`
      );

      const data = await response.json();

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

  const disconnectYoutube = async () => {
    setConnectingYt(true);
    try {
      const response = await fetch(`http://localhost:8000/youtube/disconnect/${educatorId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        toast.success("YouTube Disconnected");
        setYtConnected({ connected: false, channelName: "" });
      }
    } catch (error) {
      console.error("Failed to disconnect YouTube", error);
      toast.error("Failed to disconnect YouTube.");
    } finally {
      setConnectingYt(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("connected") === "true") {
      toast.success("YouTube Connected");
      window.history.replaceState({}, "", "/educator/live-classes");
    }
  }, []);

  useEffect(() => {
    if (!educatorId) return;

    const unsub = onSnapshot(doc(db, "educators", educatorId), (snap) => {
      const data = snap.data();

      setYtConnected({
        connected: !!data?.youtubeConnected,
        channelName: data?.youtubeChannelName,
      });
    });

    return unsub;
  }, [educatorId]);

  useEffect(() => {
    if (!liveClasses.length || !educatorId) return;

    const checkAndAutoStartClasses = async () => {
      const now = new Date();
      for (const item of liveClasses) {
        if (item.status === "scheduled") {
          let scheduledDate: Date | null = null;
          if (item.scheduledTimestamp) {
            if (typeof item.scheduledTimestamp.toDate === "function") {
              scheduledDate = item.scheduledTimestamp.toDate();
            } else if ((item.scheduledTimestamp as any).seconds) {
              scheduledDate = new Date((item.scheduledTimestamp as any).seconds * 1000);
            }
          } else if (item.scheduledDate) {
            scheduledDate = new Date(item.scheduledDate);
          }

          if (scheduledDate && !isNaN(scheduledDate.getTime()) && now >= scheduledDate) {
            try {
              await updateDoc(doc(db, "live_classes", item.id), {
                status: "live",
              });
            } catch (err) {
              console.error(`Failed to auto-update class ${item.id} status to live:`, err);
            }
          }
        }
      }
    };

    checkAndAutoStartClasses();

    const interval = setInterval(checkAndAutoStartClasses, 10000);
    return () => clearInterval(interval);
  }, [liveClasses, educatorId]);

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

    setSubmitting(true);
    try {
      const branchName = branches.find((b) => b.id === selectedBranchId)?.name || "";
      const courseName = courses.find((c) => c.id === selectedCourseId)?.name || "";
      const batchName = batches.find((b) => b.id === selectedBatchId)?.name || "";
      const enrolledCount = studentCounts[selectedBatchId] || 0;

      // Parse schedule timestamp
      const scheduledDate = new Date(`${date}T${time}:00`);
      const scheduledTimestamp = Timestamp.fromDate(scheduledDate);

      const response = await fetch("http://localhost:8000/youtube/create-live-class", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          educatorId: educatorId,
          title,
          description,
          branchId: selectedBranchId,
          courseId: selectedCourseId,
          batchId: selectedBatchId,
          branchName,
          courseName,
          batchName,
          scheduledDate: scheduledDate.toISOString(),
          enrolledCount,
          startTime: scheduledDate.toISOString(),
        }),
      });

      const data = await response.json();
      console.log("response is", data);

      toast.success("Live Class scheduled successfully!");

      const rtmpUrl = data.rtmpUrl;
      const streamKey = data.streamKey;

      setCredentialsModal({ rtmpUrl, streamKey });

      // Reset form states
      setTitle("");
      setDescription("");
      setSelectedBranchId("");
      setSelectedCourseId("");
      setSelectedBatchId("");
      setDate("");
      setTime("");
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
      await updateDoc(doc(db, "live_classes", classId), {
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
      await deleteDoc(doc(db, "live_classes", classId));
      toast.success("Live Class deleted");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete live class");
    }
  };

  const handleEditClick = (c: LiveClass) => {
    setEditingClass(c);
    setTitle(c.title);
    setDescription(c.description || "");
    setSelectedBranchId(c.branchId);
    setSelectedCourseId(c.courseId);
    setSelectedBatchId(c.batchId);

    let localDate = "";
    let localTime = "";

    let dateSource: Date | null = null;
    if (c.scheduledTimestamp) {
      if (typeof c.scheduledTimestamp.toDate === "function") {
        dateSource = c.scheduledTimestamp.toDate();
      } else if ((c.scheduledTimestamp as any).seconds) {
        dateSource = new Date((c.scheduledTimestamp as any).seconds * 1000);
      }
    } else if (c.scheduledDate) {
      dateSource = new Date(c.scheduledDate);
    }

    if (dateSource && !isNaN(dateSource.getTime())) {
      const yyyy = dateSource.getFullYear();
      const mm = String(dateSource.getMonth() + 1).padStart(2, "0");
      const dd = String(dateSource.getDate()).padStart(2, "0");
      localDate = `${yyyy}-${mm}-${dd}`;

      const hh = String(dateSource.getHours()).padStart(2, "0");
      const min = String(dateSource.getMinutes()).padStart(2, "0");
      localTime = `${hh}:${min}`;
    }

    setDate(localDate);
    setTime(localTime);
  };

  const handleUpdateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClass) return;

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

    setSubmitting(true);
    try {
      const branchName = branches.find((b) => b.id === selectedBranchId)?.name || "";
      const courseName = courses.find((c) => c.id === selectedCourseId)?.name || "";
      const batchName = batches.find((b) => b.id === selectedBatchId)?.name || "";
      const enrolledCount = studentCounts[selectedBatchId] || 0;

      // Parse schedule timestamp
      const scheduledDate = new Date(`${date}T${time}:00`);
      const scheduledTimestamp = Timestamp.fromDate(scheduledDate);

      await updateDoc(doc(db, "live_classes", editingClass.id), {
        title: title.trim(),
        description: description.trim(),
        branchId: selectedBranchId,
        courseId: selectedCourseId,
        batchId: selectedBatchId,
        branchName,
        courseName,
        batchName,
        scheduledDate: date,
        startTime: time,
        scheduledTimestamp,
        enrolledCount,
      });

      toast.success("Live class updated");
      setEditingClass(null);
      // Reset form states
      setTitle("");
      setDescription("");
      setSelectedBranchId("");
      setSelectedCourseId("");
      setSelectedBatchId("");
      setDate("");
      setTime("");
    } catch (err) {
      console.error(err);
      toast.error("Update failed");
    } finally {
      setSubmitting(false);
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
    if (!timeStr) return "";
    if (timeStr.includes("T") || (timeStr.includes("-") && timeStr.length > 5)) {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
      }
    }
    const parts = timeStr.split(":");
    if (parts.length >= 2) {
      const hr = parseInt(parts[0], 10);
      const min = parts[1];
      const ampm = hr >= 12 ? "PM" : "AM";
      const formattedHr = hr % 12 || 12;
      return `${formattedHr}:${min} ${ampm}`;
    }
    return timeStr;
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
        {!showCreateForm && !editingClass ? (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            {/* Header */}
            <div className="flex flex-col items-start justify-between gap-5 md:flex-row md:items-center">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate("/educator")}
                    className="hidden rounded-full hover:bg-primary md:flex"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold tracking-tight">Live Classes</h1>
                  <p className="hidden text-sm text-muted-foreground md:block">
                    Schedule, broadcast, and track attendance of live classes
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => navigate("/educator/live-classes/guide")}
                  className="gap-1.5 rounded-lg border-border text-xs hover:bg-primary"
                >
                  <HelpCircle className="h-4 w-4" /> Creation Guide
                </Button>
                <Button
                  onClick={() => setShowCreateForm(true)}
                  className="gradient-bg rounded-lg shadow-sm"
                >
                  <Plus className="mr-2 h-4 w-4" /> Create Live Class
                </Button>
              </div>
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
                    {stats[tab === "scheduled" ? "upcoming" : tab] > 0 && (
                      <span
                        className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${
                          tab === "live"
                            ? "animate-pulse bg-red-500/10 text-red-600"
                            : tab === "scheduled"
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {stats[tab === "scheduled" ? "upcoming" : tab]}
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

                      <div className="space-y-2 border-t border-border/40 pt-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-4 w-4 text-primary/65" />
                          <span>{formatDateLabel(item.scheduledDate)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-4 w-4 text-primary/65" />
                          <span>{formatTimeLabel(item.startTime)}</span>
                        </div>
                      </div>

                      {/* Card Footer Actions depending on status */}
                      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/30 pt-3">
                        {item.status === "scheduled" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 gap-1.5 rounded-lg border-border text-xs"
                              onClick={() => handleEditClick(item)}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 gap-1.5 rounded-lg border-border text-xs hover:bg-primary"
                              onClick={() => {
                                setCredentialsModal({
                                  rtmpUrl: item.youtubeRtmpUrl,
                                  streamKey: item.youtubeStreamKey,
                                });
                              }}
                            >
                              <Key className="h-3.5 w-3.5" />
                              Credentials
                            </Button>
                          </>
                        )}

                        {item.status === "live" && (
                          <>
                            <Button
                              size="sm"
                              className="py-4.5 flex-1 gap-1.5 rounded-lg bg-red-600 text-xs hover:bg-red-700"
                              onClick={() => navigate(`/educator/live-classes/${item.id}`)}
                            >
                              <Tv className="h-4 w-4" />
                              Join
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="py-4.5 flex-1 gap-1.5 rounded-lg border-red-200 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                              onClick={() => handleUpdateStatus(item.id, "completed")}
                            >
                              End Live
                            </Button>
                          </>
                        )}

                        {item.status === "completed" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 gap-1.5 rounded-lg border-border text-xs"
                              onClick={() => navigate(`/educator/live-classes/${item.id}`)}
                            >
                              <Tv className="h-3.5 w-3.5 text-primary" />
                              Recording
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
                onClick={() => {
                  setShowCreateForm(false);
                  setEditingClass(null);
                  setTitle("");
                  setDescription("");
                  setSelectedBranchId("");
                  setSelectedCourseId("");
                  setSelectedBatchId("");
                  setDate("");
                  setTime("");
                }}
                className="rounded-full hover:bg-primary"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h2 className="text-xl font-bold tracking-tight">
                  {editingClass ? "Edit Live Class" : "Create Live Class"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {editingClass
                    ? "Modify fields and save updates to the scheduled live class"
                    : "Setup and schedule a virtual live classroom"}
                </p>
              </div>
            </div>

            <Card className="border-border/60 shadow-card">
              <CardContent className="space-y-8 p-6">
                <form
                  onSubmit={editingClass ? handleUpdateClass : handleCreateLiveClass}
                  className="space-y-8"
                >
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

                    {!ytConnected.connected ? (
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
                              {ytConnected.channelName[0]}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <h4 className="truncate text-sm font-bold text-green-950">
                                  {ytConnected.channelName}
                                </h4>
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            className="border-red-200 bg-red-50/30 text-red-900 hover:bg-red-100 hover:text-red-900"
                            onClick={disconnectYoutube}
                            disabled={connectingYt}
                          >
                            {connectingYt ? (
                              <>
                                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                Disconnecting...
                              </>
                            ) : (
                              "Disconnect"
                            )}
                          </Button>
                        </Card>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 border-t border-border/40 pt-6">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-28 rounded-lg"
                      onClick={() => {
                        setShowCreateForm(false);
                        setEditingClass(null);
                        setTitle("");
                        setDescription("");
                        setSelectedBranchId("");
                        setSelectedCourseId("");
                        setSelectedBatchId("");
                        setDate("");
                        setTime("");
                      }}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="gradient-bg rounded-lg text-white shadow-soft"
                      disabled={submitting || !ytConnected.connected || connectingYt}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                          {editingClass ? "Saving..." : "Scheduling..."}
                        </>
                      ) : editingClass ? (
                        "Save Changes"
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

      {/* Credentials Dialog */}
      <Dialog
        open={!!credentialsModal}
        onOpenChange={(open) => {
          if (!open) {
            setCredentialsModal(null);
            setShowStreamKey(false);
          }
        }}
      >
        <DialogContent className="max-w-md rounded-xl p-6">
          <DialogHeader className="space-y-1.5">
            <div className="flex items-center gap-2 text-primary">
              <Key className="h-5 w-5 text-primary" />
              <DialogTitle className="text-xl font-bold">YouTube Stream Credentials</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Use these streaming credentials in your software (e.g. OBS, Streamlabs) to stream to
              YouTube.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            {/* YouTube RTMP URL */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  YouTube RTMP URL
                </label>
                <span className="text-[10px] text-muted-foreground">Recommended</span>
              </div>
              <div className="relative flex items-center">
                <input
                  type="text"
                  readOnly
                  value={credentialsModal?.rtmpUrl || ""}
                  className="w-full select-all rounded-lg border border-input bg-muted/40 py-2.5 pl-3 pr-10 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => handleCopyText(credentialsModal?.rtmpUrl || "", "RTMP URL")}
                  className="absolute right-2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* YouTube Stream Key */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  YouTube Stream Key
                </label>
                <span className="text-[10px] font-medium text-red-500">Keep this secret!</span>
              </div>
              <div className="relative flex items-center">
                <input
                  type={showStreamKey ? "text" : "password"}
                  readOnly
                  value={credentialsModal?.streamKey || ""}
                  className="w-full select-all rounded-lg border border-input bg-muted/40 py-2.5 pl-3 pr-20 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="absolute right-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowStreamKey(!showStreamKey)}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {showStreamKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyText(credentialsModal?.streamKey || "", "Stream Key")}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              className="gradient-bg w-24 rounded-lg font-medium text-white hover:opacity-90"
              onClick={() => {
                setCredentialsModal(null);
                setShowStreamKey(false);
              }}
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
