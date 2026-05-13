import { useEffect, useState } from "react";
import { Loader2, ShoppingCart, Tag, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { collection, doc, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";
import { toast } from "sonner";

import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/ui/select";
import { Separator } from "@shared/ui/separator";

const API = import.meta.env.VITE_MONKEY_KING_API_URL;

type Plan = { id: string; name: string; pricePerSeat: number; features: string[] };
type Branch = { id: string; name: string };
type Course = { id: string; branchId: string; name: string };
type Batch = {
  id: string;
  branchId: string;
  courseId: string;
  name: string;
  planId: string;
  seatLimit: number;
  usedSeats: number;
};
type PaymentLog = {
  id: number;
  cashfree_order_id: string;
  batch_id: string;
  plan_id: string;
  seats_purchased: number;
  amount: number;
  discount_amount: number;
  coupon_code: string | null;
  status: "PENDING" | "SUCCESS" | "FAILED";
  created_at: string;
};

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive"> = {
  SUCCESS: "default",
  PENDING: "secondary",
  FAILED: "destructive",
};

function fmtAmount(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export default function Billing() {
  const { profile, firebaseUser, role, loading: authLoading } = useAuth();

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
  const [branches, setBranches] = useState<Branch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [paymentLogs, setPaymentLogs] = useState<PaymentLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // Purchase form
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [seatCount, setSeatCount] = useState("1");
  const [couponCode, setCouponCode] = useState("");
  const [couponValid, setCouponValid] = useState<boolean | null>(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMsg, setCouponMsg] = useState("");
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [paying, setPaying] = useState(false);
  const [pendingVerifyOrderId, setPendingVerifyOrderId] = useState<string | null>(null);
  const [reverifyingId, setReverifyingId] = useState<string | null>(null);

  useEffect(() => {
    if (!educatorId) return;

    // Load plans
    getDocs(collection(db, "plans")).then((snap) =>
      setPlans(
        snap.docs
          .filter((d) => d.data().isActive)
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Plan, "id">),
          }))
      )
    );

    // Load branches
    onSnapshot(collection(db, "educators", educatorId, "branches"), (snap) =>
      setBranches(snap.docs.map((d) => ({ id: d.id, name: d.data().name })))
    );
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

  // Load payment logs
  useEffect(() => {
    if (!educatorId) return;
    apiFetch("/api/payment/logs")
      .then((data) => setPaymentLogs(data || []))
      .catch(() => setPaymentLogs([]))
      .finally(() => setLoadingLogs(false));
  }, [educatorId]);

  // On mount: detect Cashfree redirect and stash order_id for verification
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      window.history.replaceState({}, "", "/educator/billing");
      // Cashfree v3 appends order_id; fall back to sessionStorage
      const orderId = params.get("order_id") || sessionStorage.getItem("pendingOrderId");
      sessionStorage.removeItem("pendingOrderId");
      if (orderId) setPendingVerifyOrderId(orderId);
      else toast.success("Payment completed!");
    }
  }, []);

  // Once auth is ready and we have a pending order, verify with backend (auto-retry up to 5x)
  useEffect(() => {
    if (!pendingVerifyOrderId || !educatorId) return;
    let cancelled = false;

    async function pollVerify(retries = 5, delayMs = 2000) {
      for (let i = 0; i < retries; i++) {
        if (cancelled) return;
        try {
          const r = await apiFetch(`/api/payment/verify/${pendingVerifyOrderId}`, {
            method: "POST",
          });
          if (r?.status === "SUCCESS") {
            toast.success("Payment successful! Seats have been allocated.");
            const logs = await apiFetch("/api/payment/logs").catch(() => null);
            if (logs) setPaymentLogs(logs);
            return;
          }
          if (r?.status === "FAILED") {
            toast.error("Payment failed.");
            const logs = await apiFetch("/api/payment/logs").catch(() => null);
            if (logs) setPaymentLogs(logs);
            return;
          }
        } catch {
          /* network error — keep retrying */
        }
        if (i < retries - 1) await new Promise((res) => setTimeout(res, delayMs));
      }
      toast.info("Payment received. Seats will be allocated shortly — refresh in a minute.");
      apiFetch("/api/payment/logs")
        .then((data) => data && setPaymentLogs(data))
        .catch(() => {});
    }

    pollVerify().finally(() => {
      if (!cancelled) setPendingVerifyOrderId(null);
    });
    return () => {
      cancelled = true;
    };
  }, [pendingVerifyOrderId, educatorId]);

  // Auto-select plan from batch
  useEffect(() => {
    const batch = batches.find((b) => b.id === selectedBatchId);
    if (batch?.planId) setSelectedPlanId(batch.planId);
  }, [selectedBatchId, batches]);

  const selectedBatch = batches.find((b) => b.id === selectedBatchId);
  const batchLockedPlanId = selectedBatch?.planId || null;

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const seats = Math.max(1, parseInt(seatCount) || 1);
  const baseAmount = selectedPlan ? selectedPlan.pricePerSeat * seats : 0;
  const finalAmount = Math.max(0, baseAmount - couponDiscount);

  async function handleValidateCoupon() {
    if (!couponCode.trim() || !baseAmount) return;
    setValidatingCoupon(true);
    try {
      const result = await apiFetch(
        `/api/coupons/validate?code=${encodeURIComponent(couponCode.trim())}&amount=${baseAmount}`
      );
      setCouponValid(result.valid);
      setCouponDiscount(result.valid ? result.discount_amount : 0);
      setCouponMsg(
        result.valid
          ? `Coupon applied — saving ${fmtAmount(result.discount_amount)} (${result.discount_percent}% off)`
          : result.error_message || "Invalid coupon"
      );
    } catch {
      setCouponValid(false);
      setCouponMsg("Could not validate coupon");
    } finally {
      setValidatingCoupon(false);
    }
  }

  function resetCoupon() {
    setCouponCode("");
    setCouponValid(null);
    setCouponDiscount(0);
    setCouponMsg("");
  }

  async function handlePay() {
    if (!selectedBranchId || !selectedCourseId || !selectedBatchId || !selectedPlanId) {
      toast.error("Select branch, course, batch and plan");
      return;
    }
    if (seats < 1) {
      toast.error("At least 1 seat required");
      return;
    }

    setPaying(true);
    try {
      const body = {
        branch_id: selectedBranchId,
        course_id: selectedCourseId,
        batch_id: selectedBatchId,
        plan_id: selectedPlanId,
        seats,
        coupon_code: couponValid ? couponCode.trim() : null,
        educator_name: profile?.displayName || profile?.fullName || "Educator",
        educator_email: profile?.email || firebaseUser?.email || "",
        educator_phone: profile?.phone || "",
        return_url: `${window.location.origin}/educator/billing?payment=success`,
      };

      const result = await apiFetch("/api/payment/initiate", {
        method: "POST",
        body: JSON.stringify(body),
      });

      // Load Cashfree JS SDK and open checkout
      const cashfreeEnv = import.meta.env.VITE_CASHFREE_ENV || "sandbox";
      const cashfree = (window as any).Cashfree?.({ mode: cashfreeEnv });
      if (!cashfree) {
        toast.error("Cashfree SDK not loaded. Check your index.html script tag.");
        return;
      }

      // Stash order_id so we can verify status after redirect
      sessionStorage.setItem("pendingOrderId", result.order_id);

      cashfree.checkout({
        paymentSessionId: result.payment_session_id,
        redirectTarget: "_self",
      });
    } catch (e: any) {
      toast.error(e.message || "Payment initiation failed");
    } finally {
      setPaying(false);
    }
  }

  async function handleReverify(orderId: string) {
    setReverifyingId(orderId);
    try {
      const r = await apiFetch(`/api/payment/verify/${orderId}`, { method: "POST" });
      if (r?.status === "SUCCESS") toast.success("Seats allocated successfully!");
      else if (r?.status === "FAILED") toast.error("Payment failed.");
      else toast.info("Payment still pending — try again in a moment.");
      const logs = await apiFetch("/api/payment/logs").catch(() => null);
      if (logs) setPaymentLogs(logs);
    } catch {
      toast.error("Verification failed. Try again.");
    } finally {
      setReverifyingId(null);
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
        <h1 className="text-2xl font-bold">Billing & Plan</h1>
        <p className="text-sm text-muted-foreground">Purchase seats for your batches</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Purchase Form */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Purchase Seats
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
                      {b.name} — {b.usedSeats}/{b.seatLimit} seats used
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Plan */}
            <div className="space-y-2">
              <Label>Plan</Label>
              {batchLockedPlanId && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  This batch is already on{" "}
                  <b>{plans.find((p) => p.id === batchLockedPlanId)?.name || batchLockedPlanId}</b>.
                  You can only extend with the same plan.
                </p>
              )}
              <div className="grid gap-2">
                {plans.map((p) => {
                  const locked = !!batchLockedPlanId && p.id !== batchLockedPlanId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => !locked && setSelectedPlanId(p.id)}
                      disabled={locked}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${locked ? "cursor-not-allowed opacity-40" : "hover:border-primary"} ${selectedPlanId === p.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{p.name}</span>
                        <span className="text-sm font-semibold">
                          {fmtAmount(p.pricePerSeat)}
                          <span className="text-xs font-normal text-muted-foreground">/seat</span>
                        </span>
                      </div>
                      {p.features && p.features.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {p.features.map((f, i) => (
                            <li
                              key={i}
                              className="flex items-center gap-1 text-xs text-muted-foreground"
                            >
                              <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      )}
                    </button>
                  );
                })}
                {plans.length === 0 && (
                  <p className="text-sm text-muted-foreground">No plans available.</p>
                )}
              </div>
            </div>

            {/* Seat count */}
            <div className="space-y-1">
              <Label>Number of Seats</Label>
              <Input
                type="number"
                min={1}
                value={seatCount}
                onChange={(e) => {
                  setSeatCount(e.target.value);
                  resetCoupon();
                }}
              />
            </div>

            {/* Coupon */}
            <div className="space-y-1">
              <Label>Coupon Code (optional)</Label>
              <div className="flex gap-2">
                <Input
                  value={couponCode}
                  onChange={(e) => {
                    setCouponCode(e.target.value.toUpperCase());
                    if (couponValid !== null) resetCoupon();
                  }}
                  placeholder="ENTER CODE"
                  className="font-mono"
                />
                <Button
                  variant="outline"
                  onClick={handleValidateCoupon}
                  disabled={!couponCode.trim() || !baseAmount || validatingCoupon}
                >
                  {validatingCoupon ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Tag className="h-4 w-4" />
                  )}
                  Apply
                </Button>
              </div>
              {couponMsg && (
                <p
                  className={`flex items-center gap-1 text-sm ${couponValid ? "text-green-600" : "text-destructive"}`}
                >
                  {couponValid ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  {couponMsg}
                </p>
              )}
            </div>

            <Separator />

            {/* Price breakdown */}
            {selectedPlan && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {seats} × {selectedPlan.name} ({fmtAmount(selectedPlan.pricePerSeat)}/seat)
                  </span>
                  <span>{fmtAmount(baseAmount)}</span>
                </div>
                {couponDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Coupon Discount</span>
                    <span>− {fmtAmount(couponDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1 text-base font-bold">
                  <span>Total Payable</span>
                  <span>{fmtAmount(finalAmount)}</span>
                </div>
              </div>
            )}

            <Button
              className="w-full"
              onClick={handlePay}
              disabled={paying || !selectedBatchId || !selectedPlanId || seats < 1}
            >
              {paying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Pay {finalAmount > 0 ? fmtAmount(finalAmount) : ""}
            </Button>
          </CardContent>
        </Card>

        {/* Batch Seat Summary */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Batch Seat Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {batches.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Select a branch and course to see batch seats.
              </p>
            ) : (
              <div className="space-y-3">
                {batches.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between border-b pb-2 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium">{b.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {plans.find((p) => p.id === b.planId)?.name}
                      </p>
                    </div>
                    <Badge
                      variant={
                        b.usedSeats >= b.seatLimit && b.seatLimit > 0 ? "destructive" : "secondary"
                      }
                    >
                      {b.usedSeats}/{b.seatLimit} seats
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment History */}
      <Card>
        <CardHeader>
          <CardTitle>Payment History</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {loadingLogs ? (
            <div className="flex justify-center p-6">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Seats</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Coupon</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentLogs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.cashfree_order_id}</TableCell>
                    <TableCell>{l.seats_purchased}</TableCell>
                    <TableCell>{fmtAmount(l.amount)}</TableCell>
                    <TableCell>
                      {l.discount_amount > 0 ? fmtAmount(l.discount_amount) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.coupon_code || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={STATUS_BADGE[l.status] ?? "secondary"}>{l.status}</Badge>
                        {l.status === "PENDING" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => handleReverify(l.cashfree_order_id)}
                            disabled={reverifyingId === l.cashfree_order_id}
                            title="Re-verify payment"
                          >
                            <RefreshCw
                              className={`h-3 w-3 ${reverifyingId === l.cashfree_order_id ? "animate-spin" : ""}`}
                            />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(l.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
                {paymentLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No payment history yet.
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
