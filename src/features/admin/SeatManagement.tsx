import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { toast } from "sonner";

import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { Badge } from "@shared/ui/badge";
import { Label } from "@shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@shared/ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Loader2,
  ShieldCheck,
  UserCheck,
  UserX,
  Zap,
} from "lucide-react";
import { Switch } from "@shared/ui/switch";
import { cn } from "@shared/lib/utils";
import React from "react";

// ---------- types ----------

type Ts = Timestamp | null | undefined;

type EducatorDoc = {
  seatLimit?: number;
  status?: string;
  lastSeatTransactionId?: string;
  seatUpdatedAt?: Ts;
  lastSeatTransactionAt?: Ts;
  maxBranches?: number;
  allowedSubjectIds?: string[];
  trialSeats?: number;
  trialExpiryAt?: Ts | string;
  trialStatus?: string;
  displayName?: string;
  email?: string;
  phone?: string;
  accessExpiresAt?: Ts;
  lastReminderSentAt?: Ts;
};

type TxRow = {
  id: string;
  transactionId?: string;
  type?: string;
  previousSeatLimit?: number;
  newSeatLimit?: number;
  delta?: number;
  note?: string | null;
  usedSeatsAtUpdate?: number;
  updatedAt?: Ts;
  updatedBy?: string;
  updatedByEmail?: string | null;
};

type BillingSeat = {
  id: string;
  status: string;
  assignedAt: Ts;
  studentName?: string;
  studentEmail?: string;
  batchId?: string;
  courseId?: string;
};

type InstituteOption = {
  uid: string;
  displayName: string;
  email: string;
  tenantSlug?: string;
  phone?: string;
};

type BatchNode = {
  id: string;
  name: string;
  usedSeats?: number;
  startDate?: string;
  endDate?: string;
};
type CourseNode = {
  id: string;
  name: string;
  seatLimit?: number;
  usedSeats?: number;
  planId?: string;
  batches: BatchNode[];
};
type BranchNode = { id: string; name: string; courses: CourseNode[] };

type PaymentRecord = {
  id: string;
  amount: number;
  date: Ts;
  seatsGranted: number | null;
  accessExpiresAt: Ts | null;
  note: string | null;
  recordedBy: string;
  recordedAt: Ts;
};

// ---------- helpers ----------

function fmtTs(ts: Ts) {
  if (!ts) return "-";
  try {
    return new Date((ts as Timestamp).seconds * 1000).toLocaleString();
  } catch {
    return "-";
  }
}

function fmtDate(ts: Ts | string) {
  if (!ts) return "-";
  try {
    if (typeof ts === "string") return new Date(ts).toLocaleDateString();
    return new Date((ts as Timestamp).seconds * 1000).toLocaleDateString();
  } catch {
    return "-";
  }
}

function fmtAmount(amount: number | null | undefined) {
  if (amount == null) return "—";
  return `₹${amount.toLocaleString("en-IN")}`;
}

async function postWithToken(firebaseUser: any, path: string, body: Record<string, unknown>) {
  const token = await firebaseUser.getIdToken();
  const base = import.meta.env.VITE_MONKEY_KING_API_URL || "";
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || data?.error || "Request failed");
  return data;
}

function expiryBadge(ts: Ts) {
  if (!ts) return null;
  const expiry = new Date((ts as Timestamp).seconds * 1000);
  const now = new Date();
  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 0)
    return (
      <Badge variant="destructive" className="text-xs">
        Expired
      </Badge>
    );
  if (daysLeft <= 30)
    return (
      <Badge className="bg-amber-100 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
        Expires in {daysLeft}d
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-xs">
      Until {fmtDate(ts)}
    </Badge>
  );
}

// ---------- component ----------

export default function SeatManagement() {
  const { firebaseUser } = useAuth();
  const [searchParams] = useSearchParams();

  // Institute selector
  const [allInstitutes, setAllInstitutes] = useState<InstituteOption[]>([]);
  const [loadingInstitutes, setLoadingInstitutes] = useState(true);
  const [comboOpen, setComboOpen] = useState(false);
  const [comboSearch, setComboSearch] = useState("");
  const [targetId, setTargetId] = useState("");

  // Educator snapshot
  const [educator, setEducator] = useState<EducatorDoc | null>(null);
  const [usedSeats, setUsedSeats] = useState(0);
  const [activeSeats, setActiveSeats] = useState<BillingSeat[]>([]);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [tx, setTx] = useState<TxRow[]>([]);

  const [busy, setBusy] = useState(false);

  // Trial seats dialog
  const [trialOpen, setTrialOpen] = useState(false);
  const [trialPlanId, setTrialPlanId] = useState("");
  const [trialSeats, setTrialSeats] = useState(5);
  const [trialExpiry, setTrialExpiry] = useState("");
  const [trialNote, setTrialNote] = useState("");
  const [trialBusy, setTrialBusy] = useState(false);

  // Add to Pool dialog
  const [addPoolOpen, setAddPoolOpen] = useState(false);
  const [addPoolPlanId, setAddPoolPlanId] = useState("");
  const [addPoolSeats, setAddPoolSeats] = useState(10);
  const [addPoolNote, setAddPoolNote] = useState("");
  const [addPoolBusy, setAddPoolBusy] = useState(false);

  // Pool status (real-time)
  const [pools, setPools] = useState<
    { planId: string; availableSeats: number; allocatedSeats: number; totalSeats: number }[]
  >([]);

  // Plans (for trial / add-to-pool selectors)
  const [allPlans, setAllPlans] = useState<
    { id: string; name: string; pricePerSeat: number; featureDefaults?: any }[]
  >([]);

  // Hierarchy tab
  const [hierarchy, setHierarchy] = useState<BranchNode[]>([]);
  const [loadingHierarchy, setLoadingHierarchy] = useState(false);
  const [expandedBranches, setExpandedBranches] = useState<Record<string, boolean>>({});
  const [expandedCourses, setExpandedCourses] = useState<Record<string, boolean>>({});

  // Division controls
  const [maxBranchesInput, setMaxBranchesInput] = useState(5);
  const [allowedCourseIds, setAllowedCourseIds] = useState<string[]>([]);
  const [allowedSubjectIds, setAllowedSubjectIds] = useState<string[]>([]);
  const [expandedCourseSubjects, setExpandedCourseSubjects] = useState<Record<string, boolean>>({});
  const [savingDivision, setSavingDivision] = useState(false);
  const [allCourses, setAllCourses] = useState<{ id: string; name: string }[]>([]);
  const [allSubjects, setAllSubjects] = useState<{ id: string; name: string; courseId: string }[]>(
    []
  );

  // Record Payment dialog
  const [recordPayOpen, setRecordPayOpen] = useState(false);
  const [rpAmount, setRpAmount] = useState("");
  const [rpDate, setRpDate] = useState(new Date().toISOString().split("T")[0]);
  const [rpSeats, setRpSeats] = useState("");
  const [rpPlanId, setRpPlanId] = useState("");
  const [rpExpiry, setRpExpiry] = useState("");
  const [rpNote, setRpNote] = useState("");
  const [rpBusy, setRpBusy] = useState(false);

  // Payment records
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [loadingPayRecords, setLoadingPayRecords] = useState(false);

  // Send reminder
  const [reminderBusy, setReminderBusy] = useState(false);

  // Access expiry inline edit
  const [expiryInput, setExpiryInput] = useState("");
  const [savingExpiry, setSavingExpiry] = useState(false);

  const seatLimit = pools.reduce((sum, p) => sum + p.totalSeats, 0);
  const available = Math.max(0, seatLimit - usedSeats);

  const selectedInstitute = allInstitutes.find((i) => i.uid === targetId) || null;

  const filteredInstitutes = useMemo(() => {
    const q = comboSearch.toLowerCase();
    if (!q) return allInstitutes;
    return allInstitutes.filter(
      (i) =>
        i.displayName.toLowerCase().includes(q) ||
        i.email.toLowerCase().includes(q) ||
        (i.tenantSlug || "").toLowerCase().includes(q)
    );
  }, [allInstitutes, comboSearch]);

  // Load all institutes on mount; pre-select educator from ?educatorId param
  useEffect(() => {
    setLoadingInstitutes(true);
    getDocs(query(collection(db, "users"), where("role", "==", "EDUCATOR")))
      .then((snap) => {
        const list: InstituteOption[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            uid: d.id,
            displayName: data.displayName || data.name || "Unnamed",
            email: data.email || "",
            tenantSlug: data.tenantSlug || "",
            phone: data.phone || data.phoneNumber || "",
          };
        });
        list.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setAllInstitutes(list);
        const paramId = searchParams.get("educatorId");
        if (paramId) setTargetId(paramId);
      })
      .finally(() => setLoadingInstitutes(false));
  }, []);

  // Load plans on mount
  useEffect(() => {
    getDocs(collection(db, "plans")).then((snap) => {
      setAllPlans(
        snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: data.name || d.id,
            pricePerSeat: data.pricePerSeat || 0,
            featureDefaults: data.featureDefaults,
          };
        })
      );
    });
  }, []);

  // Load global courses
  useEffect(() => {
    getDocs(collection(db, "courses")).then((snap) =>
      setAllCourses(snap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name })))
    );
  }, []);

  // Load global subjects
  useEffect(() => {
    getDocs(collection(db, "subjects")).then((snap) =>
      setAllSubjects(
        snap.docs.map((d) => ({
          id: d.id,
          name: (d.data() as any).name as string,
          courseId: (d.data() as any).courseId as string,
        }))
      )
    );
  }, []);

  // Sync division controls from educator doc
  useEffect(() => {
    if (!educator) return;
    setMaxBranchesInput(educator.maxBranches ?? 5);
    setAllowedCourseIds((educator as any).allowedCourseIds ?? []);
    setAllowedSubjectIds((educator as any).allowedSubjectIds ?? []);
  }, [educator]);

  // Subscribe educator + billingSeats + transactions + pools
  useEffect(() => {
    if (!targetId) return;

    const un1 = onSnapshot(doc(db, "educators", targetId), (snap) => {
      setEducator(snap.exists() ? (snap.data() as EducatorDoc) : null);
    });

    const un2 = onSnapshot(
      query(collection(db, "educators", targetId, "billingSeats"), where("status", "==", "active")),
      async (snap) => {
        setUsedSeats(snap.size);
        setLoadingSeats(true);
        const rows: BillingSeat[] = await Promise.all(
          snap.docs.map(async (d) => {
            const data = d.data() as any;
            const learnerSnap = await getDocs(
              query(
                collection(db, "educators", targetId, "students"),
                where("__name__", "==", d.id)
              )
            ).catch(() => null);
            const learner = learnerSnap?.docs[0]?.data() as any;
            return {
              id: d.id,
              status: data.status,
              assignedAt: data.assignedAt,
              batchId: data.batchId,
              courseId: data.courseId,
              studentName: learner?.name || "Unknown",
              studentEmail: learner?.email || "",
            };
          })
        );
        setActiveSeats(rows);
        setLoadingSeats(false);
      }
    );

    const un3 = onSnapshot(
      query(
        collection(db, "educators", targetId, "seatTransactions"),
        orderBy("updatedAt", "desc")
      ),
      (snap) => setTx(snap.docs.map((d) => ({ id: d.id, ...(d.data() as TxRow) })))
    );

    const un4 = onSnapshot(collection(db, "educators", targetId, "seatPools"), (snap) =>
      setPools(
        snap.docs.map((d) => ({
          planId: d.id,
          availableSeats: d.data().availableSeats || 0,
          allocatedSeats: d.data().allocatedSeats || 0,
          totalSeats: d.data().totalSeats || 0,
        }))
      )
    );

    return () => {
      un1();
      un2();
      un3();
      un4();
    };
  }, [targetId]);

  // Load payment records for selected educator
  useEffect(() => {
    if (!targetId) {
      setPaymentRecords([]);
      return;
    }
    setLoadingPayRecords(true);
    const unsub = onSnapshot(
      query(collection(db, "educators", targetId, "paymentRecords"), orderBy("date", "desc")),
      (snap) => {
        setPaymentRecords(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PaymentRecord, "id">) }))
        );
        setLoadingPayRecords(false);
      }
    );
    return () => unsub();
  }, [targetId]);

  // Sync expiry input from educator doc
  useEffect(() => {
    if (!educator?.accessExpiresAt) {
      setExpiryInput("");
      return;
    }
    try {
      const d = new Date((educator.accessExpiresAt as Timestamp).seconds * 1000);
      setExpiryInput(d.toISOString().split("T")[0]);
    } catch {
      setExpiryInput("");
    }
  }, [educator]);

  // Load shared branches (used by trial dialog)
  const [sharedBranches, setSharedBranches] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!targetId) {
      setSharedBranches([]);
      return;
    }
    getDocs(collection(db, "educators", targetId, "branches")).then((snap) => {
      setSharedBranches(snap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name || d.id })));
    });
  }, [targetId]);

  // Load hierarchy when tab becomes active
  const loadHierarchy = async () => {
    if (!targetId) return;
    setLoadingHierarchy(true);
    try {
      const branchSnap = await getDocs(collection(db, "educators", targetId, "branches"));
      const branches: BranchNode[] = await Promise.all(
        branchSnap.docs.map(async (bDoc) => {
          const courseSnap = await getDocs(
            collection(db, "educators", targetId, "branches", bDoc.id, "courses")
          );
          const courses: CourseNode[] = await Promise.all(
            courseSnap.docs.map(async (cDoc) => {
              const batchSnap = await getDocs(
                collection(
                  db,
                  "educators",
                  targetId,
                  "branches",
                  bDoc.id,
                  "courses",
                  cDoc.id,
                  "batches"
                )
              );
              const batches: BatchNode[] = batchSnap.docs.map((batchDoc) => {
                const bd = batchDoc.data() as any;
                return {
                  id: batchDoc.id,
                  name: bd.name || batchDoc.id,
                  usedSeats: bd.usedSeats,
                  startDate: bd.startDate,
                  endDate: bd.endDate,
                };
              });
              const cd = cDoc.data() as any;
              return {
                id: cDoc.id,
                name: cd.name || cDoc.id,
                seatLimit: cd.seatLimit,
                usedSeats: cd.usedSeats,
                planId: cd.planId,
                batches,
              };
            })
          );
          const bd = bDoc.data() as any;
          return { id: bDoc.id, name: bd.name || bDoc.id, courses };
        })
      );
      setHierarchy(branches);
    } finally {
      setLoadingHierarchy(false);
    }
  };

  // ---------- actions ----------

  const submitTrial = async () => {
    if (!targetId || !trialPlanId || !trialExpiry || !firebaseUser) return;
    setTrialBusy(true);
    try {
      await postWithToken(firebaseUser, "/api/payment/admin/add-to-pool", {
        educator_id: targetId,
        plan_id: trialPlanId,
        seats: trialSeats,
        valid_until: trialExpiry,
        is_trial: true,
        note: trialNote.trim() || null,
      });
      toast.success(`${trialSeats} trial seats added to pool (expires ${trialExpiry})`);
      setTrialOpen(false);
      setTrialPlanId("");
      setTrialSeats(5);
      setTrialExpiry("");
      setTrialNote("");
    } catch (e: any) {
      toast.error(e.message || "Failed to allot trial seats");
    } finally {
      setTrialBusy(false);
    }
  };

  const submitAddPool = async () => {
    if (!targetId || !addPoolPlanId || addPoolSeats < 1 || !firebaseUser) return;
    setAddPoolBusy(true);
    try {
      await postWithToken(firebaseUser, "/api/payment/admin/add-to-pool", {
        educator_id: targetId,
        plan_id: addPoolPlanId,
        seats: addPoolSeats,
        note: addPoolNote.trim() || null,
      });
      toast.success(`${addPoolSeats} seats added to pool`);
      setAddPoolOpen(false);
      setAddPoolPlanId("");
      setAddPoolSeats(10);
      setAddPoolNote("");
    } catch (e: any) {
      toast.error(e.message || "Failed to add seats to pool");
    } finally {
      setAddPoolBusy(false);
    }
  };

  const submitRecordPayment = async () => {
    if (!targetId || !rpAmount || !rpDate || !firebaseUser) return;
    setRpBusy(true);
    try {
      const amount = parseFloat(rpAmount);
      const seatsGranted = rpSeats ? parseInt(rpSeats) : null;
      const accessExpiresAt = rpExpiry ? Timestamp.fromDate(new Date(rpExpiry)) : null;

      // Write payment record to Firestore
      await addDoc(collection(db, "educators", targetId, "paymentRecords"), {
        amount,
        date: Timestamp.fromDate(new Date(rpDate)),
        seatsGranted: seatsGranted ?? null,
        accessExpiresAt,
        note: rpNote.trim() || null,
        recordedBy: firebaseUser.uid,
        recordedAt: serverTimestamp(),
      });

      // Update access expiry on educator doc if provided
      if (accessExpiresAt) {
        await updateDoc(doc(db, "educators", targetId), {
          accessExpiresAt,
          updatedAt: serverTimestamp(),
        });
      }

      // Add seats to pool if provided and plan selected
      if (seatsGranted && seatsGranted > 0 && rpPlanId) {
        await postWithToken(firebaseUser, "/api/payment/admin/add-to-pool", {
          educator_id: targetId,
          plan_id: rpPlanId,
          seats: seatsGranted,
          note: `Manual payment: ₹${amount}${rpNote ? ` — ${rpNote}` : ""}`,
        });
      }

      // Notify Discord via monkey-king (non-blocking — endpoint added separately in backend)
      const mk = import.meta.env.VITE_MONKEY_KING_API_URL || "";
      const mkKey = import.meta.env.VITE_MONKEY_KING_ADMIN_KEY || "";
      fetch(`${mk}/api/admin/billing/record-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": mkKey },
        body: JSON.stringify({
          educator_id: targetId,
          educator_name: selectedInstitute?.displayName || "",
          educator_email: selectedInstitute?.email || "",
          amount,
          date: rpDate,
          seats_granted: seatsGranted,
          access_expires_at: rpExpiry || null,
          note: rpNote.trim() || null,
        }),
      }).catch(() => {});

      toast.success("Payment recorded");
      setRecordPayOpen(false);
      setRpAmount("");
      setRpDate(new Date().toISOString().split("T")[0]);
      setRpSeats("");
      setRpPlanId("");
      setRpExpiry("");
      setRpNote("");
    } catch (e: any) {
      toast.error(e.message || "Failed to record payment");
    } finally {
      setRpBusy(false);
    }
  };

  const submitSendReminder = async () => {
    if (!targetId || !firebaseUser) return;
    setReminderBusy(true);
    try {
      await updateDoc(doc(db, "educators", targetId), {
        lastReminderSentAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const mk = import.meta.env.VITE_MONKEY_KING_API_URL || "";
      const mkKey = import.meta.env.VITE_MONKEY_KING_ADMIN_KEY || "";
      fetch(`${mk}/api/admin/billing/send-reminder`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": mkKey },
        body: JSON.stringify({
          educator_id: targetId,
          educator_name: selectedInstitute?.displayName || "",
          educator_email: selectedInstitute?.email || "",
        }),
      }).catch(() => {});

      toast.success("Reminder sent");
    } catch (e: any) {
      toast.error(e.message || "Failed to send reminder");
    } finally {
      setReminderBusy(false);
    }
  };

  const saveExpiry = async () => {
    if (!targetId) return;
    setSavingExpiry(true);
    try {
      const val = expiryInput ? Timestamp.fromDate(new Date(expiryInput)) : null;
      await updateDoc(doc(db, "educators", targetId), {
        accessExpiresAt: val,
        updatedAt: serverTimestamp(),
      });
      toast.success("Access expiry updated");
    } catch {
      toast.error("Failed to update expiry");
    } finally {
      setSavingExpiry(false);
    }
  };

  const revokeSeat = async (studentId: string) => {
    if (!confirm("Revoke this student's seat? They lose access immediately.")) return;
    try {
      await updateDoc(doc(db, "educators", targetId, "billingSeats", studentId), {
        status: "revoked",
        revokedAt: serverTimestamp(),
        revokedBy: firebaseUser?.uid,
      });
      toast.success("Seat revoked");
    } catch {
      toast.error("Failed to revoke seat");
    }
  };

  const toggleEducatorStatus = async () => {
    const newStatus = educator?.status === "suspended" ? "active" : "suspended";
    if (!confirm(`Set educator status to ${newStatus}?`)) return;
    setBusy(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "educators", targetId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, "users", targetId), { status: newStatus, updatedAt: serverTimestamp() });
      await batch.commit();
      toast.success(`Educator ${newStatus}`);
    } catch {
      toast.error("Failed to update status");
    } finally {
      setBusy(false);
    }
  };

  const saveDivisionControls = async () => {
    if (!targetId) return;
    setSavingDivision(true);
    try {
      await updateDoc(doc(db, "educators", targetId), {
        maxBranches: maxBranchesInput,
        allowedCourseIds,
        allowedSubjectIds,
        updatedAt: serverTimestamp(),
      });
      toast.success("Division controls saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSavingDivision(false);
    }
  };

  // ---------- render ----------

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Educators & Config</h1>
          <Badge variant="secondary">Admin</Badge>
        </div>
        {targetId && educator && (
          <Button
            variant={educator.status === "suspended" ? ("success" as any) : "destructive"}
            size="sm"
            onClick={toggleEducatorStatus}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : educator.status === "suspended" ? (
              <UserCheck className="mr-2 h-4 w-4" />
            ) : (
              <UserX className="mr-2 h-4 w-4" />
            )}
            {educator.status === "suspended" ? "Reactivate" : "Suspend"}
          </Button>
        )}
      </div>

      {/* Institute selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select Institute</CardTitle>
        </CardHeader>
        <CardContent>
          <Popover open={comboOpen} onOpenChange={setComboOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={comboOpen}
                className="w-full max-w-md justify-between"
              >
                {selectedInstitute ? (
                  <span className="truncate">
                    {selectedInstitute.displayName}
                    {selectedInstitute.tenantSlug && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        · {selectedInstitute.tenantSlug}
                      </span>
                    )}
                  </span>
                ) : loadingInstitutes ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading institutes…
                  </span>
                ) : (
                  <span className="text-muted-foreground">Search institute…</span>
                )}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[420px] p-0" align="start">
              <Command>
                <CommandInput
                  placeholder="Search by name, email, or slug…"
                  value={comboSearch}
                  onValueChange={setComboSearch}
                />
                <CommandList>
                  <CommandEmpty>No institutes found.</CommandEmpty>
                  <CommandGroup>
                    {filteredInstitutes.slice(0, 50).map((inst) => (
                      <CommandItem
                        key={inst.uid}
                        value={inst.uid}
                        onSelect={() => {
                          setTargetId(inst.uid);
                          setComboOpen(false);
                          setComboSearch("");
                          setHierarchy([]);
                          setActiveSeats([]);
                          setTx([]);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            targetId === inst.uid ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">{inst.displayName}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {inst.email}
                            {inst.tenantSlug ? ` · ${inst.tenantSlug}` : ""}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {targetId && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">
                UID: <span className="font-mono text-foreground">{targetId}</span>
              </span>
              {educator?.status === "suspended" && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> Account Suspended
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {targetId && (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Seat stats */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Seats & Billing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Assigned</span>
                  <span className="text-xl font-bold">{seatLimit}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Used</span>
                  <span className="text-xl font-bold">{usedSeats}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Available</span>
                  <span className="text-xl font-bold text-green-600 dark:text-green-400">
                    {available}
                  </span>
                </div>

                {educator?.trialSeats && educator.trialSeats > 0 ? (
                  <div className="flex items-center justify-between border-t pt-2">
                    <span className="text-sm text-muted-foreground">Trial Seats</span>
                    <div className="text-right">
                      <span className="font-semibold">{educator.trialSeats}</span>
                      {educator.trialExpiryAt && (
                        <p className="text-xs text-muted-foreground">
                          expires {fmtDate(educator.trialExpiryAt)}
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}

                {/* Access expiry */}
                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Access Expiry</span>
                    {expiryBadge(educator?.accessExpiresAt)}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={expiryInput}
                      onChange={(e) => setExpiryInput(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={saveExpiry}
                      disabled={savingExpiry}
                      className="shrink-0"
                    >
                      {savingExpiry ? <Loader2 className="h-3 w-3 animate-spin" /> : "Set"}
                    </Button>
                  </div>
                  {educator?.lastReminderSentAt && (
                    <p className="text-xs text-muted-foreground">
                      Last reminder: {fmtTs(educator.lastReminderSentAt)}
                    </p>
                  )}
                </div>

                <div className="space-y-2 pt-1">
                  <Button variant="outline" onClick={() => setTrialOpen(true)} className="w-full">
                    Allot Trial Seats
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAddPoolPlanId("");
                      setAddPoolSeats(10);
                      setAddPoolNote("");
                      setAddPoolOpen(true);
                    }}
                    className="w-full"
                  >
                    Add to Pool
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setRpAmount("");
                      setRpDate(new Date().toISOString().split("T")[0]);
                      setRpSeats("");
                      setRpPlanId("");
                      setRpExpiry("");
                      setRpNote("");
                      setRecordPayOpen(true);
                    }}
                    className="w-full"
                  >
                    Record Payment
                  </Button>
                  <Button
                    variant="outline"
                    onClick={submitSendReminder}
                    disabled={reminderBusy}
                    className="w-full"
                  >
                    {reminderBusy ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Bell className="mr-2 h-4 w-4" />
                    )}
                    Send Reminder
                  </Button>
                </div>

                {pools.length > 0 && (
                  <div className="border-t pt-3">
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Seat Pools</p>
                    <div className="space-y-1">
                      {pools.map((pool) => (
                        <div
                          key={pool.planId}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="text-muted-foreground">
                            {allPlans.find((p) => p.id === pool.planId)?.name || pool.planId}
                          </span>
                          <span>
                            <span className="font-semibold text-primary">
                              {pool.availableSeats}
                            </span>
                            <span className="text-muted-foreground">/{pool.totalSeats} avail</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1 pt-2 text-xs text-muted-foreground">
                  <div>
                    Last Tx:{" "}
                    <span className="font-mono text-foreground">
                      {educator?.lastSeatTransactionId || "-"}
                    </span>
                  </div>
                  <div>
                    Updated: {fmtTs(educator?.seatUpdatedAt || educator?.lastSeatTransactionAt)}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabs: history / payments / active / hierarchy */}
            <Card className="lg:col-span-2">
              <CardContent className="p-0">
                <Tabs defaultValue="history">
                  <div className="px-6 pt-4">
                    <TabsList className="h-auto flex-wrap gap-1">
                      <TabsTrigger value="history">Transactions</TabsTrigger>
                      <TabsTrigger value="payments">Payments</TabsTrigger>
                      <TabsTrigger value="active">Students ({usedSeats})</TabsTrigger>
                      <TabsTrigger value="hierarchy" onClick={loadHierarchy}>
                        Hierarchy
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  {/* Transaction history */}
                  <TabsContent value="history" className="mt-0 p-6">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Transaction ID</TableHead>
                            <TableHead className="text-right">Seats</TableHead>
                            <TableHead className="text-right">Δ</TableHead>
                            <TableHead>Note</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tx.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground">
                                No transactions yet.
                              </TableCell>
                            </TableRow>
                          ) : (
                            tx.slice(0, 30).map((r) => (
                              <TableRow key={r.id}>
                                <TableCell className="text-sm">{fmtTs(r.updatedAt)}</TableCell>
                                <TableCell>
                                  {r.type === "trial" ? (
                                    <Badge variant="outline" className="text-xs">
                                      Trial
                                    </Badge>
                                  ) : r.type === "admin_link" ? (
                                    <Badge variant="secondary" className="text-xs">
                                      Link
                                    </Badge>
                                  ) : (
                                    <Badge className="text-xs">Manual</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="font-mono text-xs">
                                  {r.transactionId || r.id.slice(0, 8)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {Number(r.newSeatLimit ?? 0)}
                                </TableCell>
                                <TableCell className="text-right">{Number(r.delta ?? 0)}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {r.note || "-"}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  {/* Payment records */}
                  <TabsContent value="payments" className="mt-0 p-6">
                    {loadingPayRecords ? (
                      <div className="flex justify-center py-10">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <>
                        {paymentRecords.length > 0 && (
                          <p className="mb-3 text-sm font-medium">
                            Total paid:{" "}
                            <span className="text-primary">
                              {fmtAmount(paymentRecords.reduce((s, r) => s + (r.amount || 0), 0))}
                            </span>
                          </p>
                        )}
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead className="text-right">Seats</TableHead>
                                <TableHead>Access Until</TableHead>
                                <TableHead>Note</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {paymentRecords.length === 0 ? (
                                <TableRow>
                                  <TableCell
                                    colSpan={5}
                                    className="py-10 text-center text-muted-foreground"
                                  >
                                    No payments recorded yet.
                                  </TableCell>
                                </TableRow>
                              ) : (
                                paymentRecords.map((r) => (
                                  <TableRow key={r.id}>
                                    <TableCell className="text-sm">{fmtDate(r.date)}</TableCell>
                                    <TableCell className="text-right font-semibold">
                                      {fmtAmount(r.amount)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {r.seatsGranted ?? "—"}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      {fmtDate(r.accessExpiresAt)}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                      {r.note || "—"}
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </>
                    )}
                  </TabsContent>

                  {/* Active students */}
                  <TabsContent value="active" className="mt-0 p-6">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Student</TableHead>
                            <TableHead>Assigned On</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {loadingSeats ? (
                            <TableRow>
                              <TableCell colSpan={3} className="py-10 text-center">
                                <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                              </TableCell>
                            </TableRow>
                          ) : activeSeats.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={3}
                                className="py-10 text-center text-muted-foreground"
                              >
                                No active seats.
                              </TableCell>
                            </TableRow>
                          ) : (
                            activeSeats.map((s) => (
                              <TableRow key={s.id}>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{s.studentName}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {s.studentEmail}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm">{fmtTs(s.assignedAt)}</TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => revokeSeat(s.id)}
                                    className="text-destructive"
                                  >
                                    Revoke
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  {/* Hierarchy tab */}
                  <TabsContent value="hierarchy" className="mt-0 p-6">
                    {loadingHierarchy ? (
                      <div className="flex justify-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : hierarchy.length === 0 ? (
                      <p className="py-10 text-center text-sm text-muted-foreground">
                        No branches found. Click the Hierarchy tab to load.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {hierarchy.map((branch) => (
                          <div key={branch.id} className="overflow-hidden rounded-xl border">
                            <button
                              className="flex w-full items-center gap-2 bg-muted/40 px-4 py-3 text-sm font-semibold transition-colors hover:bg-muted/70"
                              onClick={() =>
                                setExpandedBranches((p) => ({
                                  ...p,
                                  [branch.id]: !p[branch.id],
                                }))
                              }
                            >
                              {expandedBranches[branch.id] ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                              {branch.name}
                              <span className="ml-auto text-xs font-normal text-muted-foreground">
                                {branch.courses.length} course
                                {branch.courses.length !== 1 ? "s" : ""}
                              </span>
                            </button>
                            {expandedBranches[branch.id] &&
                              branch.courses.map((course) => (
                                <div key={course.id} className="border-t">
                                  <button
                                    className="flex w-full items-center gap-2 py-2.5 pl-8 pr-4 text-sm transition-colors hover:bg-muted/30"
                                    onClick={() =>
                                      setExpandedCourses((p) => ({
                                        ...p,
                                        [course.id]: !p[course.id],
                                      }))
                                    }
                                  >
                                    {expandedCourses[course.id] ? (
                                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                    )}
                                    <span className="font-medium">{course.name}</span>
                                    <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                                      {course.planId && (
                                        <Badge variant="outline" className="h-5 text-[10px]">
                                          {course.planId}
                                        </Badge>
                                      )}
                                      <span className="font-semibold text-foreground">
                                        {course.usedSeats ?? 0}/{course.seatLimit ?? 0}
                                      </span>{" "}
                                      seats
                                    </span>
                                  </button>
                                  {expandedCourses[course.id] &&
                                    course.batches.map((batch) => (
                                      <div
                                        key={batch.id}
                                        className="flex items-center gap-3 border-t bg-background/50 py-2 pl-14 pr-4 text-sm"
                                      >
                                        <span className="text-muted-foreground">↳</span>
                                        <span>{batch.name}</span>
                                        {(batch.startDate || batch.endDate) && (
                                          <span className="text-xs text-muted-foreground">
                                            {batch.startDate} – {batch.endDate}
                                          </span>
                                        )}
                                        <span className="ml-auto text-xs text-muted-foreground">
                                          {batch.usedSeats ?? 0} active
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Division controls */}
          <Card>
            <CardHeader>
              <CardTitle>Division Controls</CardTitle>
              <p className="text-sm text-muted-foreground">
                Set branch limit and allowed subjects for this educator
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm text-muted-foreground">Max Branches</Label>
                <Input
                  type="number"
                  min={1}
                  value={maxBranchesInput}
                  onChange={(e) => setMaxBranchesInput(Number(e.target.value))}
                  className="mt-1 max-w-xs"
                />
              </div>
              <div>
                <Label className="mb-2 block text-sm text-muted-foreground">
                  Allowed Courses &amp; Subjects (empty = no access)
                </Label>
                <div className="space-y-1.5">
                  {allCourses.map((c) => {
                    const isCourseAllowed = allowedCourseIds.includes(c.id);
                    const courseSubjects = allSubjects.filter((s) => s.courseId === c.id);
                    const allowedInCourse = courseSubjects.filter((s) =>
                      allowedSubjectIds.includes(s.id)
                    ).length;
                    const isExpanded = expandedCourseSubjects[c.id];
                    return (
                      <div key={c.id} className="rounded-md border">
                        <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50">
                          <input
                            type="checkbox"
                            checked={isCourseAllowed}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setAllowedCourseIds((prev) =>
                                checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)
                              );
                              const subIds = courseSubjects.map((s) => s.id);
                              if (checked) {
                                setAllowedSubjectIds((prev) => [...new Set([...prev, ...subIds])]);
                              } else {
                                setAllowedSubjectIds((prev) =>
                                  prev.filter((id) => !subIds.includes(id))
                                );
                              }
                            }}
                          />
                          <span className="flex-1 font-medium">{c.name}</span>
                          {isCourseAllowed && courseSubjects.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                setExpandedCourseSubjects((prev) => ({
                                  ...prev,
                                  [c.id]: !prev[c.id],
                                }));
                              }}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                              {allowedInCourse}/{courseSubjects.length} subjects
                              {isExpanded ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
                            </button>
                          )}
                        </label>
                        {isCourseAllowed && isExpanded && courseSubjects.length > 0 && (
                          <div className="space-y-1 border-t bg-muted/20 px-6 py-2">
                            {courseSubjects.map((s) => (
                              <label
                                key={s.id}
                                className="flex cursor-pointer items-center gap-2 py-0.5 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={allowedSubjectIds.includes(s.id)}
                                  onChange={(e) =>
                                    setAllowedSubjectIds((prev) =>
                                      e.target.checked
                                        ? [...prev, s.id]
                                        : prev.filter((id) => id !== s.id)
                                    )
                                  }
                                />
                                {s.name}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {allCourses.length === 0 && (
                    <p className="text-sm text-muted-foreground">No courses defined yet.</p>
                  )}
                </div>
              </div>
              <Button onClick={saveDivisionControls} disabled={savingDivision}>
                {savingDivision && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Division Controls
              </Button>
            </CardContent>
          </Card>

          {/* Features */}
          <Card>
            <CardHeader>
              <CardTitle>Features</CardTitle>
              <p className="text-sm text-muted-foreground">
                Toggle access to premium features for this educator.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <FeatureToggleRow
                icon={<BookOpen className="h-4 w-4" />}
                label="Content Library"
                description="Educator can upload and manage books/notes; students can access course content"
                checked={Boolean((educator as any)?.features?.contentLibrary ?? true)}
                onChange={async (v) => {
                  await updateDoc(doc(db, "educators", targetId), {
                    "features.contentLibrary": v,
                    updatedAt: serverTimestamp(),
                  });
                  toast.success(`Content Library ${v ? "enabled" : "disabled"}`);
                }}
              />
              <FeatureToggleRow
                icon={<Bot className="h-4 w-4" />}
                label="AI Doubt Chatbot"
                description="Students get access to the RAG-powered AI chatbot for this educator's courses"
                checked={Boolean((educator as any)?.features?.chatbot ?? true)}
                onChange={async (v) => {
                  await updateDoc(doc(db, "educators", targetId), {
                    "features.chatbot": v,
                    updatedAt: serverTimestamp(),
                  });
                  toast.success(`Chatbot ${v ? "enabled" : "disabled"}`);
                }}
              />
              <FeatureToggleRow
                icon={<Zap className="h-4 w-4" />}
                label="DPP Generator"
                description="Educator can generate AI-powered daily practice papers"
                checked={Boolean((educator as any)?.features?.dpp ?? true)}
                onChange={async (v) => {
                  await updateDoc(doc(db, "educators", targetId), {
                    "features.dpp": v,
                    updatedAt: serverTimestamp(),
                  });
                  toast.success(`DPP Generator ${v ? "enabled" : "disabled"}`);
                }}
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* Add to Pool dialog */}
      <Dialog open={addPoolOpen} onOpenChange={setAddPoolOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Seats to Pool</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Grants seats into the educator's plan pool without requiring payment.
            </p>
            <div>
              <Label>Plan</Label>
              <Select value={addPoolPlanId} onValueChange={setAddPoolPlanId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select plan" />
                </SelectTrigger>
                <SelectContent>
                  {allPlans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Seats</Label>
              <Input
                type="number"
                min={1}
                value={addPoolSeats}
                onChange={(e) => setAddPoolSeats(Math.max(1, Number(e.target.value)))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input
                value={addPoolNote}
                onChange={(e) => setAddPoolNote(e.target.value)}
                placeholder="e.g. Demo allocation, 30-day pilot"
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setAddPoolOpen(false)}
                disabled={addPoolBusy}
              >
                Cancel
              </Button>
              <Button
                onClick={submitAddPool}
                disabled={addPoolBusy || !addPoolPlanId || addPoolSeats < 1}
              >
                {addPoolBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add to Pool
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Trial seats dialog */}
      <Dialog open={trialOpen} onOpenChange={setTrialOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Allot Trial Seats</DialogTitle>
          </DialogHeader>
          <p className="-mt-1 text-sm text-muted-foreground">
            Seats go into the educator's pool. Seats are automatically removed when the expiry date
            passes.
          </p>
          <div className="space-y-3">
            <div>
              <Label>Plan</Label>
              <Select value={trialPlanId} onValueChange={setTrialPlanId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select plan" />
                </SelectTrigger>
                <SelectContent>
                  {allPlans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Number of Seats</Label>
                <Input
                  type="number"
                  value={trialSeats}
                  onChange={(e) => setTrialSeats(Math.max(1, Number(e.target.value)))}
                  min={1}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>
                  Valid Until <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={trialExpiry}
                  onChange={(e) => setTrialExpiry(e.target.value)}
                  className="mt-1"
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input
                value={trialNote}
                onChange={(e) => setTrialNote(e.target.value)}
                placeholder="e.g. 14-day demo trial"
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setTrialOpen(false)} disabled={trialBusy}>
                Cancel
              </Button>
              <Button onClick={submitTrial} disabled={trialBusy || !trialPlanId || !trialExpiry}>
                {trialBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Allot
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Record Payment dialog */}
      <Dialog open={recordPayOpen} onOpenChange={setRecordPayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <p className="-mt-1 text-sm text-muted-foreground">
            Log an offline/bank transfer payment from this educator. Discord notification will be
            sent automatically.
          </p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>
                  Amount (₹) <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={rpAmount}
                  onChange={(e) => setRpAmount(e.target.value)}
                  placeholder="5000"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>
                  Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={rpDate}
                  onChange={(e) => setRpDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Seats Granted (optional)</Label>
                <Input
                  type="number"
                  min={1}
                  value={rpSeats}
                  onChange={(e) => setRpSeats(e.target.value)}
                  placeholder="50"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Access Expires (optional)</Label>
                <Input
                  type="date"
                  value={rpExpiry}
                  onChange={(e) => setRpExpiry(e.target.value)}
                  className="mt-1"
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
            </div>
            {rpSeats && parseInt(rpSeats) > 0 && (
              <div>
                <Label>Plan (required to add seats to pool)</Label>
                <Select value={rpPlanId} onValueChange={setRpPlanId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {allPlans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Note (optional)</Label>
              <Input
                value={rpNote}
                onChange={(e) => setRpNote(e.target.value)}
                placeholder="e.g. Bank transfer, UPI ref #12345"
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setRecordPayOpen(false)} disabled={rpBusy}>
                Cancel
              </Button>
              <Button onClick={submitRecordPayment} disabled={rpBusy || !rpAmount || !rpDate}>
                {rpBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Record Payment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- Feature toggle row ----
function FeatureToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-muted-foreground">{icon}</span>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
