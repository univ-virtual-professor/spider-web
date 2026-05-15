import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
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
  increment,
  addDoc,
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
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Copy,
  ExternalLink,
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
  trialExpiryAt?: Ts;
  trialStatus?: string;
  displayName?: string;
  email?: string;
  phone?: string;
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

// ---------- helpers ----------

function fmtTs(ts: Ts) {
  if (!ts) return "-";
  try {
    return new Date((ts as Timestamp).seconds * 1000).toLocaleString();
  } catch {
    return "-";
  }
}

function fmtDate(ts: Ts) {
  if (!ts) return "-";
  try {
    return new Date((ts as Timestamp).seconds * 1000).toLocaleDateString();
  } catch {
    return "-";
  }
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

  // Update seats dialog
  const [updateOpen, setUpdateOpen] = useState(false);
  const [newSeatLimit, setNewSeatLimit] = useState(0);
  const [transactionId, setTransactionId] = useState("");
  const [updateNote, setUpdateNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Trial (unified) seats dialog
  const [trialOpen, setTrialOpen] = useState(false);
  const [trialBranchId, setTrialBranchId] = useState("");
  const [trialCourseId, setTrialCourseId] = useState("");
  const [trialBatchId, setTrialBatchId] = useState("");
  const [trialCourses, setTrialCourses] = useState<{ id: string; name: string }[]>([]);
  const [trialBatches, setTrialBatches] = useState<{ id: string; name: string; planId?: string }[]>(
    []
  );
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

  // Payment link dialog
  const [payLinkOpen, setPayLinkOpen] = useState(false);
  const [plBranches, setPlBranches] = useState<{ id: string; name: string }[]>([]);
  const [plCourses, setPlCourses] = useState<{ id: string; name: string }[]>([]);
  const [plBranchId, setPlBranchId] = useState("");
  const [plCourseId, setPlCourseId] = useState("");
  const [plPlanId, setPlPlanId] = useState("");
  const [plSeats, setPlSeats] = useState(10);
  const [plAmount, setPlAmount] = useState(0);
  const [plAmountManual, setPlAmountManual] = useState(false);
  const [plPhone, setPlPhone] = useState("");
  const [plBusy, setPlBusy] = useState(false);
  const [plResult, setPlResult] = useState<{ url: string; id: string } | null>(null);
  const [plCopied, setPlCopied] = useState(false);
  const [allPlans, setAllPlans] = useState<
    { id: string; name: string; pricePerSeat: number; featureDefaults?: any }[]
  >([]);

  // Plan selector for update-seats dialog
  const [updatePlanId, setUpdatePlanId] = useState("");

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

  // AI config
  const [chatTokenLimit, setChatTokenLimit] = useState(100000);
  const [dppDailyLimit, setDppDailyLimit] = useState(3);
  const [maxQpRequests, setMaxQpRequests] = useState(5);
  const [savingAiConfig, setSavingAiConfig] = useState(false);

  const trialSeatLimit = Math.max(0, Number(educator?.seatLimit || 0));
  const purchasedSeatLimit = Math.max(0, Number((educator as any)?.purchasedSeatLimit || 0));
  const seatLimit = trialSeatLimit + purchasedSeatLimit;
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
        snap.docs
          .map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              name: data.name || d.id,
              pricePerSeat: data.pricePerSeat || 0,
              featureDefaults: data.featureDefaults,
            };
          })
          .filter((p) => p.pricePerSeat > 0)
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

  // Sync division + AI config from educator doc
  useEffect(() => {
    if (!educator) return;
    setMaxBranchesInput(educator.maxBranches ?? 5);
    setAllowedCourseIds((educator as any).allowedCourseIds ?? []);
    setAllowedSubjectIds((educator as any).allowedSubjectIds ?? []);
    setChatTokenLimit((educator as any).chatDailyTokenLimit ?? 100000);
    setDppDailyLimit((educator as any).dppDailyLimit ?? 3);
    setMaxQpRequests((educator as any).maxQuestionPaperRequests ?? 5);
  }, [educator]);

  // Subscribe educator + billingSeats + transactions
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

  // Pre-fill payment link phone from educator doc
  useEffect(() => {
    if (educator?.phone) setPlPhone(educator.phone);
  }, [educator]);

  // Load hierarchy when tab becomes active or targetId changes
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

  // Load branches shared by both trial and payment-link dialogs
  const [sharedBranches, setSharedBranches] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!targetId) {
      setSharedBranches([]);
      return;
    }
    getDocs(collection(db, "educators", targetId, "branches")).then((snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name || d.id }));
      setSharedBranches(list);
      setPlBranches(list);
    });
  }, [targetId]);

  // Load courses for trial dialog
  useEffect(() => {
    if (!trialBranchId || !targetId) {
      setTrialCourses([]);
      setTrialCourseId("");
      return;
    }
    getDocs(collection(db, "educators", targetId, "branches", trialBranchId, "courses")).then(
      (snap) => {
        setTrialCourses(snap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name || d.id })));
      }
    );
    setTrialCourseId("");
    setTrialBatchId("");
  }, [trialBranchId, targetId]);

  // Load batches for trial dialog
  useEffect(() => {
    if (!trialCourseId || !trialBranchId || !targetId) {
      setTrialBatches([]);
      setTrialBatchId("");
      return;
    }
    getDocs(
      collection(
        db,
        "educators",
        targetId,
        "branches",
        trialBranchId,
        "courses",
        trialCourseId,
        "batches"
      )
    ).then((snap) => {
      setTrialBatches(
        snap.docs.map((d) => {
          const data = d.data() as any;
          return { id: d.id, name: data.name || d.id, planId: data.planId || "" };
        })
      );
    });
    setTrialBatchId("");
  }, [trialCourseId, trialBranchId, targetId]);

  // Auto-lock plan when a batch with an existing plan is selected
  const trialSelectedBatch = trialBatches.find((b) => b.id === trialBatchId);
  const trialBatchLockedPlanId = trialSelectedBatch?.planId || null;

  useEffect(() => {
    if (trialBatchLockedPlanId) setTrialPlanId(trialBatchLockedPlanId);
  }, [trialBatchLockedPlanId]);

  // Load payment link branches/courses
  useEffect(() => {
    if (!payLinkOpen || !targetId) return;
    setPlBranches(sharedBranches);
  }, [payLinkOpen, targetId]);

  useEffect(() => {
    if (!plBranchId || !targetId) {
      setPlCourses([]);
      setPlCourseId("");
      return;
    }
    getDocs(collection(db, "educators", targetId, "branches", plBranchId, "courses")).then(
      (snap) => {
        setPlCourses(snap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name || d.id })));
      }
    );
    setPlCourseId("");
  }, [plBranchId, targetId]);

  // Auto-calc payment link amount
  useEffect(() => {
    if (plAmountManual) return;
    const plan = allPlans.find((p) => p.id === plPlanId);
    if (plan) setPlAmount(plan.pricePerSeat * plSeats);
  }, [plPlanId, plSeats, plAmountManual, allPlans]);

  // ---------- actions ----------

  const submitUpdate = async () => {
    if (!targetId || !firebaseUser) return;
    setBusy(true);
    try {
      await postWithToken(firebaseUser, "/api/admin/update-seats", {
        educatorId: targetId,
        newSeatLimit: Math.max(0, Math.floor(newSeatLimit || 0)),
        transactionId: transactionId.trim(),
        note: updateNote.trim(),
        ...(updatePlanId && updatePlanId !== "none" ? { planId: updatePlanId } : {}),
      });
      toast.success(
        updatePlanId && updatePlanId !== "none"
          ? "Seats updated and plan features applied"
          : "Seats updated"
      );
      setUpdateOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to update seats");
    } finally {
      setBusy(false);
    }
  };

  const submitTrial = async () => {
    if (
      !targetId ||
      !trialBranchId ||
      !trialCourseId ||
      !trialBatchId ||
      !trialPlanId ||
      !trialExpiry ||
      !firebaseUser
    )
      return;
    setTrialBusy(true);
    try {
      await postWithToken(firebaseUser, "/api/payment/admin/allocate-seats", {
        educator_id: targetId,
        branch_id: trialBranchId,
        course_id: trialCourseId,
        batch_id: trialBatchId,
        plan_id: trialPlanId,
        seats: trialSeats,
        valid_until: trialExpiry,
        note: trialNote.trim() || null,
      });
      toast.success(`${trialSeats} trial seats allocated`);
      setTrialOpen(false);
      setTrialBranchId("");
      setTrialCourseId("");
      setTrialBatchId("");
      setTrialPlanId("");
      setTrialSeats(5);
      setTrialExpiry("");
      setTrialNote("");
    } catch (e: any) {
      toast.error(e.message || "Failed to allocate trial seats");
    } finally {
      setTrialBusy(false);
    }
  };

  const submitPaymentLink = async () => {
    if (!targetId || !plPlanId || !plSeats || !plAmount || !firebaseUser) return;
    setPlBusy(true);
    try {
      const institute = allInstitutes.find((i) => i.uid === targetId);
      const result = await postWithToken(firebaseUser, "/api/payment/admin/create-payment-link", {
        educator_id: targetId,
        plan_id: plPlanId,
        seats: plSeats,
        amount: plAmount,
        educator_phone: plPhone,
        educator_name: institute?.displayName || "",
        educator_email: institute?.email || "",
        note: updateNote,
      });
      setPlResult({ url: result.cf_link_url, id: result.cf_link_id });
    } catch (e: any) {
      toast.error(e.message || "Failed to create payment link");
    } finally {
      setPlBusy(false);
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

  const saveAiConfig = async () => {
    if (!targetId) return;
    setSavingAiConfig(true);
    try {
      await updateDoc(doc(db, "educators", targetId), {
        chatDailyTokenLimit: Math.max(0, Math.floor(chatTokenLimit)),
        dppDailyLimit: Math.max(0, Math.floor(dppDailyLimit)),
        maxQuestionPaperRequests: Math.max(0, Math.floor(maxQpRequests)),
        updatedAt: serverTimestamp(),
      });
      toast.success("AI config saved");
    } catch {
      toast.error("Failed to save AI config");
    } finally {
      setSavingAiConfig(false);
    }
  };

  const copyPayLink = () => {
    if (!plResult) return;
    navigator.clipboard.writeText(plResult.url);
    setPlCopied(true);
    setTimeout(() => setPlCopied(false), 2000);
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
                          setPlResult(null);
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
                <CardTitle>Seats</CardTitle>
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

                <div className="space-y-2 pt-1">
                  <Button
                    onClick={() => {
                      setNewSeatLimit(seatLimit);
                      setTransactionId("");
                      setUpdateNote("");
                      setUpdatePlanId("");
                      setUpdateOpen(true);
                    }}
                    className="w-full"
                  >
                    Update Seats
                  </Button>
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
                      setPlResult(null);
                      setPlPlanId("");
                      setPlSeats(10);
                      setPlAmountManual(false);
                      setPayLinkOpen(true);
                    }}
                    className="w-full"
                  >
                    Send Payment Link
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Cannot reduce below {usedSeats} active seats.
                </p>

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
              </CardContent>
            </Card>

            {/* Tabs: history / active / hierarchy / payment links */}
            <Card className="lg:col-span-2">
              <CardContent className="p-0">
                <Tabs defaultValue="history">
                  <div className="px-6 pt-4">
                    <TabsList className="h-auto flex-wrap gap-1">
                      <TabsTrigger value="history">Transactions</TabsTrigger>
                      <TabsTrigger value="active">Students ({usedSeats})</TabsTrigger>
                      <TabsTrigger value="hierarchy" onClick={loadHierarchy}>
                        Hierarchy
                      </TabsTrigger>
                      <TabsTrigger value="paylinks">Payment Links</TabsTrigger>
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
                                setExpandedBranches((p) => ({ ...p, [branch.id]: !p[branch.id] }))
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

                  {/* Payment links */}
                  <PaymentLinksTab targetId={targetId} />
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
                Toggle access to premium features for this educator. Applied automatically when
                seats are assigned with a plan.
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

          {/* AI Config */}
          <Card>
            <CardHeader>
              <CardTitle>AI Config</CardTitle>
              <p className="text-sm text-muted-foreground">
                Chatbot token limit and DPP generation quota for this educator
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-sm text-muted-foreground">Chat Daily Token Limit</Label>
                  <Input
                    type="number"
                    min={0}
                    value={chatTokenLimit}
                    onChange={(e) => setChatTokenLimit(Number(e.target.value))}
                    className="mt-1 max-w-xs"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tokens per day for the AI chatbot (default 100,000)
                  </p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">DPP Daily Limit</Label>
                  <Input
                    type="number"
                    min={0}
                    value={dppDailyLimit}
                    onChange={(e) => setDppDailyLimit(Number(e.target.value))}
                    className="mt-1 max-w-xs"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Max DPP papers generated per day (default 3)
                  </p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">
                    Question Paper Requests / Month
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={maxQpRequests}
                    onChange={(e) => setMaxQpRequests(Number(e.target.value))}
                    className="mt-1 max-w-xs"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Max question paper upload requests per month (default 5)
                  </p>
                </div>
              </div>
              <Button onClick={saveAiConfig} disabled={savingAiConfig}>
                {savingAiConfig && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save AI Config
              </Button>
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
              Grants seats into the educator's plan pool without requiring payment. Educator can
              then allocate these to any batch.
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

      {/* Update seats dialog */}
      <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Update Assigned Seats</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Current: <b>{seatLimit}</b> · Used: <b>{usedSeats}</b>
            </p>
            <div>
              <Label>New Total Seats</Label>
              <Input
                type="number"
                value={newSeatLimit}
                onChange={(e) => setNewSeatLimit(Number(e.target.value))}
                min={0}
                className="mt-1"
              />
            </div>
            <div>
              <Label>
                Transaction ID <span className="text-destructive">*</span>
              </Label>
              <Input
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="e.g. TXN-2026-00021"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input
                value={updateNote}
                onChange={(e) => setUpdateNote(e.target.value)}
                placeholder="e.g. Paid via UPI, 10 seats added"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Apply Plan Features (optional)</Label>
              <Select value={updatePlanId} onValueChange={setUpdatePlanId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="No plan — keep existing features" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No plan — keep existing features</SelectItem>
                  {allPlans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {updatePlanId &&
                updatePlanId !== "none" &&
                (() => {
                  const plan = allPlans.find((p) => p.id === updatePlanId);
                  const fd = plan?.featureDefaults;
                  if (!fd) return null;
                  return (
                    <div className="mt-2 space-y-1 rounded-md bg-muted/50 p-2 text-xs">
                      <p className="font-medium text-muted-foreground">
                        Will apply from "{plan?.name}":
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <PlanFeatureChip label="Content Library" enabled={fd.contentLibrary} />
                        <PlanFeatureChip
                          label={`Chatbot (${(fd.chatDailyTokenLimit / 1000).toFixed(0)}k/day)`}
                          enabled={fd.chatbot}
                        />
                        <PlanFeatureChip label={`DPP (${fd.dppDailyLimit}/day)`} enabled={fd.dpp} />
                      </div>
                    </div>
                  );
                })()}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setUpdateOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={submitUpdate} disabled={busy || !transactionId.trim()}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Trial seats dialog */}
      <Dialog open={trialOpen} onOpenChange={setTrialOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Allot Trial Seats</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Branch</Label>
                <Select value={trialBranchId} onValueChange={setTrialBranchId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {sharedBranches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Program</Label>
                <Select
                  value={trialCourseId}
                  onValueChange={setTrialCourseId}
                  disabled={!trialBranchId}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select program" />
                  </SelectTrigger>
                  <SelectContent>
                    {trialCourses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Batch</Label>
                <Select
                  value={trialBatchId}
                  onValueChange={setTrialBatchId}
                  disabled={!trialCourseId}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select batch" />
                  </SelectTrigger>
                  <SelectContent>
                    {trialBatches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Plan</Label>
                <Select
                  value={trialPlanId}
                  onValueChange={setTrialPlanId}
                  disabled={!!trialBatchLockedPlanId}
                >
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
                {trialBatchLockedPlanId && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    Batch is on{" "}
                    {allPlans.find((p) => p.id === trialBatchLockedPlanId)?.name ||
                      trialBatchLockedPlanId}{" "}
                    — locked.
                  </p>
                )}
              </div>
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
              <Button
                onClick={submitTrial}
                disabled={trialBusy || !trialBatchId || !trialPlanId || !trialExpiry}
              >
                {trialBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Allot
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment link dialog */}
      <Dialog
        open={payLinkOpen}
        onOpenChange={(v) => {
          setPayLinkOpen(v);
          if (!v) {
            setPlResult(null);
            setPlBusy(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Cashfree Payment Link</DialogTitle>
          </DialogHeader>
          {plResult ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Payment link created. Share with the institute to collect payment. Seats will
                auto-provision on payment.
              </p>
              <div className="flex gap-2">
                <Input value={plResult.url} readOnly className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={copyPayLink}>
                  {plCopied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => window.open(plResult.url, "_blank")}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
              <p className="font-mono text-xs text-muted-foreground">Link ID: {plResult.id}</p>
              <Button
                variant="outline"
                onClick={() => {
                  setPlResult(null);
                  setPayLinkOpen(false);
                }}
                className="w-full"
              >
                Done
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Payment will provision into the educator's seat pool for the selected plan.
              </p>
              <div>
                <Label>Plan</Label>
                <Select
                  value={plPlanId}
                  onValueChange={(v) => {
                    setPlPlanId(v);
                    setPlAmountManual(false);
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {allPlans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — ₹{p.pricePerSeat}/seat
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Seats</Label>
                  <Input
                    type="number"
                    min={1}
                    value={plSeats}
                    onChange={(e) => setPlSeats(Math.max(1, Number(e.target.value)))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Amount (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={plAmount}
                    onChange={(e) => {
                      setPlAmount(Number(e.target.value));
                      setPlAmountManual(true);
                    }}
                    className="mt-1"
                    placeholder="Auto-calculated"
                  />
                  {plAmount > 0 && !plAmountManual && (
                    <p className="mt-1 text-xs text-muted-foreground">Auto-calculated</p>
                  )}
                </div>
              </div>
              <div>
                <Label>Educator Phone</Label>
                <Input
                  value={plPhone}
                  onChange={(e) => setPlPhone(e.target.value)}
                  placeholder="10-digit mobile"
                  className="mt-1"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setPayLinkOpen(false)} disabled={plBusy}>
                  Cancel
                </Button>
                <Button
                  onClick={submitPaymentLink}
                  disabled={plBusy || !plPlanId || !plSeats || !plAmount}
                >
                  {plBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create Link
                </Button>
              </div>
            </div>
          )}
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

// ---- Plan feature chip ----
function PlanFeatureChip({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${enabled ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground line-through"}`}
    >
      {label}
    </span>
  );
}

// ---- Payment Links sub-tab ----
function PaymentLinksTab({ targetId }: { targetId: string }) {
  const [links, setLinks] = useState<any[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!targetId) return;
    const unsub = onSnapshot(
      query(collection(db, "educators", targetId, "paymentLinks"), orderBy("createdAt", "desc")),
      (snap) => setLinks(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [targetId]);

  const copy = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <TabsContent value="paylinks" className="mt-0 p-6">
      {links.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No payment links yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Course</TableHead>
                <TableHead className="text-right">Seats</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-sm">
                    {l.createdAt ? new Date(l.createdAt.seconds * 1000).toLocaleDateString() : "-"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {l.planName || l.planId || l.courseName || "-"}
                  </TableCell>
                  <TableCell className="text-right">{l.seats}</TableCell>
                  <TableCell className="text-right">
                    ₹{((l.amount || 0) / 100).toFixed(0)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        l.status === "PAID"
                          ? "default"
                          : l.status === "EXPIRED"
                            ? "destructive"
                            : "secondary"
                      }
                      className="text-xs"
                    >
                      {l.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {l.cfLinkUrl ? (
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => copy(l.cfLinkUrl, l.id)}
                        >
                          {copied === l.id ? (
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => window.open(l.cfLinkUrl, "_blank")}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </TabsContent>
  );
}
