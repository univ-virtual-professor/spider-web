import { useEffect, useState } from "react";
import { Loader2, Layers, ArrowRight, RotateCcw } from "lucide-react";
import { collection, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { toast } from "sonner";

import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Label } from "@shared/ui/label";
import { Input } from "@shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table";

const API = import.meta.env.VITE_MONKEY_KING_API_URL;

type Plan = { id: string; name: string; pricePerSeat: number };
type SeatPool = {
  planId: string;
  planName: string;
  totalSeats: number;
  availableSeats: number;
  allocatedSeats: number;
};
type Branch = { id: string; name: string };
type Course = { id: string; branchId: string; name: string };
type Batch = {
  id: string;
  branchId: string;
  courseId: string;
  name: string;
  planId?: string;
  seatLimit: number;
  usedSeats: number;
  poolAllocatedSeats?: number;
};

export default function SeatAllocation() {
  const { firebaseUser, loading: authLoading } = useAuth();

  async function apiFetch(path: string, options: RequestInit = {}) {
    const token = await firebaseUser?.getIdToken();
    const res = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    if (!res.ok) throw new Error(await res.text());
    if (res.status === 204) return null;
    return res.json();
  }

  const educatorId = firebaseUser?.uid || "";

  const [plans, setPlans] = useState<Plan[]>([]);
  const [pools, setPools] = useState<SeatPool[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);

  // Allocation form
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [seatCount, setSeatCount] = useState("1");
  const [allocating, setAllocating] = useState(false);
  const [returningBatchId, setReturningBatchId] = useState<string | null>(null);

  // All batches with pool seats (for allocation table)
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [allocatedBatches, setAllocatedBatches] = useState<Batch[]>([]);
  const [loadingTable, setLoadingTable] = useState(true);

  useEffect(() => {
    if (!educatorId) return;

    getDocs(collection(db, "plans")).then((snap) =>
      setPlans(
        snap.docs
          .filter((d) => d.data().isActive)
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Plan, "id">) }))
      )
    );

    const unsubPools = onSnapshot(collection(db, "educators", educatorId, "seatPools"), (snap) =>
      setPools(
        snap.docs.map((d) => ({
          planId: d.id,
          planName: d.data().planName || d.id,
          totalSeats: d.data().totalSeats || 0,
          availableSeats: d.data().availableSeats || 0,
          allocatedSeats: d.data().allocatedSeats || 0,
        }))
      )
    );

    const unsubBranches = onSnapshot(
      collection(db, "educators", educatorId, "branches"),
      (snap) => {
        const bs = snap.docs.map((d) => ({ id: d.id, name: d.data().name }));
        setBranches(bs);
        setAllBranches(bs);
      }
    );

    return () => {
      unsubPools();
      unsubBranches();
    };
  }, [educatorId]);

  // Load courses when branch changes
  useEffect(() => {
    if (!educatorId || !selectedBranchId) {
      setCourses([]);
      setSelectedCourseId("");
      return;
    }
    const unsub = onSnapshot(
      collection(db, "educators", educatorId, "branches", selectedBranchId, "courses"),
      (snap) =>
        setCourses(
          snap.docs.map((d) => ({ id: d.id, branchId: selectedBranchId, name: d.data().name }))
        )
    );
    return () => unsub();
  }, [educatorId, selectedBranchId]);

  // Load batches when course changes
  useEffect(() => {
    if (!educatorId || !selectedBranchId || !selectedCourseId) {
      setBatches([]);
      setSelectedBatchId("");
      return;
    }
    const unsub = onSnapshot(
      collection(
        db,
        "educators",
        educatorId,
        "branches",
        selectedBranchId,
        "courses",
        selectedCourseId,
        "batches"
      ),
      (snap) =>
        setBatches(
          snap.docs.map((d) => ({
            id: d.id,
            branchId: selectedBranchId,
            courseId: selectedCourseId,
            ...(d.data() as Omit<Batch, "id" | "branchId" | "courseId">),
          }))
        )
    );
    return () => unsub();
  }, [educatorId, selectedBranchId, selectedCourseId]);

  // Auto-lock plan when batch already has one
  const selectedBatch = batches.find((b) => b.id === selectedBatchId);
  useEffect(() => {
    if (selectedBatch?.planId) setSelectedPlanId(selectedBatch.planId);
  }, [selectedBatch]);

  // Load all batches with pool-allocated seats for the summary table
  useEffect(() => {
    if (!educatorId || allBranches.length === 0) return;
    setLoadingTable(true);

    async function fetchAll() {
      const result: Batch[] = [];
      for (const branch of allBranches) {
        const cSnap = await getDocs(
          collection(db, "educators", educatorId, "branches", branch.id, "courses")
        );
        for (const course of cSnap.docs) {
          const bSnap = await getDocs(
            collection(
              db,
              "educators",
              educatorId,
              "branches",
              branch.id,
              "courses",
              course.id,
              "batches"
            )
          );
          for (const bDoc of bSnap.docs) {
            const data = bDoc.data();
            if ((data.poolAllocatedSeats || 0) > 0) {
              result.push({
                id: bDoc.id,
                branchId: branch.id,
                courseId: course.id,
                name: data.name,
                planId: data.planId,
                seatLimit: data.seatLimit || 0,
                usedSeats: data.usedSeats || 0,
                poolAllocatedSeats: data.poolAllocatedSeats || 0,
              });
            }
          }
        }
      }
      setAllocatedBatches(result);
      setLoadingTable(false);
    }

    fetchAll().catch(() => setLoadingTable(false));
  }, [educatorId, allBranches, pools]);

  const availablePoolSeats = pools.find((p) => p.planId === selectedPlanId)?.availableSeats || 0;
  const seats = Math.max(1, parseInt(seatCount) || 1);

  async function handleAllocate() {
    if (!selectedBatchId || !selectedPlanId || seats < 1) {
      toast.error("Select batch, plan and seat count");
      return;
    }
    setAllocating(true);
    try {
      const res = await apiFetch("/api/payment/allocate", {
        method: "POST",
        body: JSON.stringify({
          branch_id: selectedBranchId,
          course_id: selectedCourseId,
          batch_id: selectedBatchId,
          plan_id: selectedPlanId,
          seats,
        }),
      });
      toast.success(`${seats} seats allocated. Pool remaining: ${res.pool_available_after}`);
      setSeatCount("1");
    } catch (e: any) {
      toast.error(e.message || "Allocation failed");
    } finally {
      setAllocating(false);
    }
  }

  async function handleReturn(batch: Batch, seats: number) {
    if (!batch.planId) return;
    setReturningBatchId(batch.id);
    try {
      await apiFetch("/api/payment/reallocate", {
        method: "POST",
        body: JSON.stringify({
          branch_id: batch.branchId,
          course_id: batch.courseId,
          batch_id: batch.id,
          plan_id: batch.planId,
          seats,
        }),
      });
      toast.success(`${seats} seats returned to pool`);
    } catch (e: any) {
      toast.error(e.message || "Return failed");
    } finally {
      setReturningBatchId(null);
    }
  }

  if (authLoading)
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Seat Allocation</h1>
        <p className="text-sm text-muted-foreground">
          Assign seats from your pool to specific batches.
        </p>
      </div>

      {/* Pool Status */}
      {pools.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No seat pools yet.{" "}
            <a href="/educator/billing" className="text-primary underline">
              Purchase seats
            </a>{" "}
            to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pools.map((pool) => (
            <Card key={pool.planId}>
              <CardContent className="pt-4">
                <div className="mb-2 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {plans.find((p) => p.id === pool.planId)?.name || pool.planName} Pool
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-center">
                  <div>
                    <p className="text-xl font-bold text-primary">{pool.availableSeats}</p>
                    <p className="text-xs text-muted-foreground">Available</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold">{pool.allocatedSeats}</p>
                    <p className="text-xs text-muted-foreground">Allocated</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-muted-foreground">{pool.totalSeats}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Allocation Form */}
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5" />
            Allocate to Batch
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Branch */}
          <div className="space-y-1">
            <Label>Branch</Label>
            <Select
              value={selectedBranchId}
              onValueChange={(v) => {
                setSelectedBranchId(v);
                setSelectedCourseId("");
                setSelectedBatchId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select branch" />
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

          {/* Course */}
          <div className="space-y-1">
            <Label>Course</Label>
            <Select
              value={selectedCourseId}
              onValueChange={(v) => {
                setSelectedCourseId(v);
                setSelectedBatchId("");
              }}
              disabled={!selectedBranchId}
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

          {/* Batch */}
          <div className="space-y-1">
            <Label>Batch</Label>
            <Select
              value={selectedBatchId}
              onValueChange={setSelectedBatchId}
              disabled={!selectedCourseId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select batch" />
              </SelectTrigger>
              <SelectContent>
                {batches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} — {b.usedSeats}/{b.seatLimit} used
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedBatch?.planId && (
              <p className="text-xs text-amber-600">
                Batch is locked to{" "}
                <b>
                  {plans.find((p) => p.id === selectedBatch.planId)?.name || selectedBatch.planId}
                </b>{" "}
                plan.
              </p>
            )}
          </div>

          {/* Plan (from pool) */}
          <div className="space-y-1">
            <Label>Plan Pool</Label>
            <Select
              value={selectedPlanId}
              onValueChange={setSelectedPlanId}
              disabled={!!selectedBatch?.planId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select plan pool" />
              </SelectTrigger>
              <SelectContent>
                {pools.map((pool) => (
                  <SelectItem
                    key={pool.planId}
                    value={pool.planId}
                    disabled={pool.availableSeats === 0}
                  >
                    {plans.find((p) => p.id === pool.planId)?.name || pool.planId} —{" "}
                    {pool.availableSeats} available
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Seat count */}
          <div className="space-y-1">
            <Label>Seats to Allocate</Label>
            <Input
              type="number"
              min={1}
              max={availablePoolSeats}
              value={seatCount}
              onChange={(e) => setSeatCount(e.target.value)}
            />
            {selectedPlanId && (
              <p className="text-xs text-muted-foreground">
                {availablePoolSeats} seats available in pool
              </p>
            )}
          </div>

          <Button
            className="w-full"
            onClick={handleAllocate}
            disabled={allocating || !selectedBatchId || !selectedPlanId || seats < 1}
          >
            {allocating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Allocate {seats} Seat{seats !== 1 ? "s" : ""}
          </Button>
        </CardContent>
      </Card>

      {/* Batch Allocation Table */}
      <Card>
        <CardHeader>
          <CardTitle>Batch Allocations</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {loadingTable ? (
            <div className="flex justify-center p-6">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Pool Allocated</TableHead>
                  <TableHead>Used / Total</TableHead>
                  <TableHead>Return</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocatedBatches.map((batch) => {
                  const returnable = batch.seatLimit - batch.usedSeats;
                  return (
                    <TableRow key={batch.id}>
                      <TableCell className="font-medium">{batch.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {plans.find((p) => p.id === batch.planId)?.name || batch.planId || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>{batch.poolAllocatedSeats || 0}</TableCell>
                      <TableCell>
                        <span
                          className={
                            batch.usedSeats >= batch.seatLimit && batch.seatLimit > 0
                              ? "font-medium text-destructive"
                              : ""
                          }
                        >
                          {batch.usedSeats} / {batch.seatLimit}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={returnable <= 0 || returningBatchId === batch.id}
                          onClick={() => handleReturn(batch, returnable)}
                          title={
                            returnable <= 0
                              ? "All seats are occupied"
                              : `Return ${returnable} seats to pool`
                          }
                        >
                          {returningBatchId === batch.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3" />
                          )}
                          <span className="ml-1">{returnable}</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {allocatedBatches.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No pool-allocated batches yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
