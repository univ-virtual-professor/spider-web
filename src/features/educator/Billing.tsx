import { useEffect, useState } from "react";
import { Loader2, ShoppingCart, Tag, CheckCircle2, XCircle, RefreshCw, Zap } from "lucide-react";
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
import { Separator } from "@shared/ui/separator";

const API = import.meta.env.VITE_MONKEY_KING_API_URL;

type Plan = { id: string; name: string; pricePerSeat: number; features: string[] };
type SeatPool = {
  planId: string;
  planName: string;
  totalSeats: number;
  availableSeats: number;
  allocatedSeats: number;
};
type PaymentLog = {
  id: number;
  cashfree_order_id: string;
  batch_id: string | null;
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

function fmtAmount(amount: number | null | undefined) {
  if (amount == null) return "—";
  return `₹${amount.toLocaleString("en-IN")}`;
}

export default function Billing() {
  const { profile, firebaseUser, loading: authLoading } = useAuth();

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
  const [paymentLogs, setPaymentLogs] = useState<PaymentLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // Purchase form
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

  type CreditStatus = {
    percentUsed: number;
    creditsUsed: number;
    creditLimit: number;
    breakdown: Record<string, number>;
    resetDate: string;
    isWarning: boolean;
    isExhausted: boolean;
    month: string;
  };
  const [creditStatus, setCreditStatus] = useState<CreditStatus | null>(null);

  useEffect(() => {
    if (!educatorId) return;
    const month = new Date().toISOString().slice(0, 7);
    const unsub = onSnapshot(doc(db, "educators", educatorId, "aiUsage", month), (snap) => {
      if (!snap.exists()) {
        setCreditStatus(null);
        return;
      }
      const data = snap.data() as any;
      const limit = data._limit || 500;
      const used = data.creditsUsed || 0;
      const percent = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
      setCreditStatus({
        percentUsed: percent,
        creditsUsed: used,
        creditLimit: limit,
        breakdown: data.breakdown || {},
        resetDate: (() => {
          const d = new Date();
          d.setMonth(d.getMonth() + 1, 1);
          return d.toISOString().slice(0, 10);
        })(),
        isWarning: percent >= 80 && percent < 100,
        isExhausted: percent >= 100,
        month,
      });
    });
    return () => unsub();
  }, [educatorId]);

  useEffect(() => {
    if (!educatorId) return;

    getDocs(collection(db, "plans")).then((snap) =>
      setPlans(
        snap.docs
          .filter((d) => d.data().isActive)
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Plan, "id">) }))
      )
    );

    const unsub = onSnapshot(collection(db, "educators", educatorId, "seatPools"), (snap) =>
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
    return () => unsub();
  }, [educatorId]);

  useEffect(() => {
    if (!educatorId) return;
    apiFetch("/api/payment/logs")
      .then((data) => setPaymentLogs(data || []))
      .catch(() => setPaymentLogs([]))
      .finally(() => setLoadingLogs(false));
  }, [educatorId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      window.history.replaceState({}, "", "/educator/billing");
      const orderId = params.get("order_id") || sessionStorage.getItem("pendingOrderId");
      sessionStorage.removeItem("pendingOrderId");
      if (orderId) setPendingVerifyOrderId(orderId);
      else toast.success("Payment completed!");
    }
  }, []);

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
            toast.success("Payment successful! Seats added to your pool.");
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
      toast.info("Payment received. Seats will be added to your pool shortly.");
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
    if (!selectedPlanId) {
      toast.error("Select a plan first");
      return;
    }
    if (seats < 1) {
      toast.error("At least 1 seat required");
      return;
    }

    setPaying(true);
    try {
      const body = {
        plan_id: selectedPlanId,
        seats,
        coupon_code: couponValid ? couponCode.trim() : null,
        educator_name: profile?.displayName || profile?.fullName || "Educator",
        educator_email: profile?.email || firebaseUser?.email || "",
        educator_phone: profile?.phone || "",
        educator_slug: profile?.tenantSlug || "",
      };

      const result = await apiFetch("/api/payment/initiate", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!(window as any).Cashfree) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Failed to load Cashfree SDK"));
          document.head.appendChild(s);
        });
      }
      const cashfreeEnv = import.meta.env.VITE_CASHFREE_ENV || "sandbox";
      const cashfree = (window as any).Cashfree?.({ mode: cashfreeEnv });
      if (!cashfree) {
        toast.error("Cashfree SDK not loaded. Check your index.html script tag.");
        return;
      }

      sessionStorage.setItem("pendingOrderId", result.order_id);
      cashfree.checkout({ paymentSessionId: result.payment_session_id, redirectTarget: "_self" });
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
      if (r?.status === "SUCCESS") toast.success("Seats added to pool successfully!");
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
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-sm text-muted-foreground">Purchase seats and manage your plan.</p>
      </div>

      {/* AI Credits Widget */}
      <Card
        className={
          creditStatus?.isExhausted
            ? "border-red-300"
            : creditStatus?.isWarning
              ? "border-amber-300"
              : ""
        }
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-primary" /> AI Credits
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {creditStatus ? (
            <>
              {(creditStatus.isWarning || creditStatus.isExhausted) && (
                <p
                  className={`text-sm font-medium ${creditStatus.isExhausted ? "text-red-600" : "text-amber-600"}`}
                >
                  {creditStatus.isExhausted
                    ? "AI credits exhausted — AI features are paused until next month."
                    : "AI credits running low — approaching your monthly limit."}
                </p>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Usage this month ({creditStatus.month})
                </span>
                <span className="font-semibold">{creditStatus.percentUsed.toFixed(1)}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted">
                <div
                  className={`h-2 rounded-full transition-all ${creditStatus.isExhausted ? "bg-red-500" : creditStatus.isWarning ? "bg-amber-500" : "bg-primary"}`}
                  style={{ width: `${Math.min(100, creditStatus.percentUsed)}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
                {Object.entries(creditStatus.breakdown)
                  .filter(([, v]) => (v as number) > 0)
                  .map(([key, val]) => (
                    <span key={key} className="capitalize">
                      {key}: {(val as number).toFixed(2)}
                    </span>
                  ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Resets on {creditStatus.resetDate}. Contact admin to increase your limit.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No AI usage this month yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Seat Balance Widget */}
      {pools.length > 0 &&
        (() => {
          const totalAvailable = pools.reduce((s, p) => s + p.availableSeats, 0);
          const totalInUse = pools.reduce((s, p) => s + p.allocatedSeats, 0);
          const totalPurchased = pools.reduce((s, p) => s + p.totalSeats, 0);
          return (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="flex flex-wrap items-center gap-6 py-4">
                <div className="flex gap-6">
                  <div>
                    <p className="text-2xl font-bold text-primary">{totalAvailable}</p>
                    <p className="text-xs text-muted-foreground">Available</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{totalInUse}</p>
                    <p className="text-xs text-muted-foreground">In use</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-muted-foreground">{totalPurchased}</p>
                    <p className="text-xs text-muted-foreground">Purchased</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}

      {/* Purchase Form */}
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Purchase Seats
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Plan selector */}
          <div className="space-y-2">
            <Label>Plan</Label>
            <div className="grid gap-2">
              {plans.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPlanId(p.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors hover:border-primary ${selectedPlanId === p.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"}`}
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
              ))}
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
            disabled={paying || !selectedPlanId || seats < 1}
          >
            {paying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Pay {finalAmount > 0 ? fmtAmount(finalAmount) : ""}
          </Button>
        </CardContent>
      </Card>

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
