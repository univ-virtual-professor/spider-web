import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";

import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table";

type SeatPool = {
  planId: string;
  planName: string;
  totalSeats: number;
  availableSeats: number;
  allocatedSeats: number;
};

type PaymentRecord = {
  id: string;
  amount: number;
  date: any;
  seatsGranted: number | null;
  accessExpiresAt: any | null;
  note: string | null;
};

function fmtAmount(amount: number | null | undefined) {
  if (amount == null) return "—";
  return `₹${amount.toLocaleString("en-IN")}`;
}

function fmtDate(ts: any) {
  if (!ts) return "—";
  try {
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return d.toLocaleDateString("en-IN");
  } catch {
    return "—";
  }
}

export default function Billing() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const educatorId = firebaseUser?.uid || "";

  const [pools, setPools] = useState<SeatPool[]>([]);
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);

  useEffect(() => {
    if (!educatorId) return;
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
    const unsub = onSnapshot(
      query(collection(db, "educators", educatorId, "paymentRecords"), orderBy("date", "desc")),
      (snap) => {
        setPaymentRecords(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PaymentRecord, "id">) }))
        );
        setLoadingRecords(false);
      }
    );
    return () => unsub();
  }, [educatorId]);

  if (authLoading)
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );

  const totalAvailable = pools.reduce((s, p) => s + p.availableSeats, 0);
  const totalInUse = pools.reduce((s, p) => s + p.allocatedSeats, 0);
  const totalSeats = pools.reduce((s, p) => s + p.totalSeats, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Your seat allocation and payment history. To add more seats, contact your admin.
        </p>
      </div>

      {/* Seat Balance */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Seat Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-8">
            <div>
              <p className="text-3xl font-bold text-primary">{totalAvailable}</p>
              <p className="text-xs text-muted-foreground">Available</p>
            </div>
            <div>
              <p className="text-3xl font-bold">{totalInUse}</p>
              <p className="text-xs text-muted-foreground">In Use</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-muted-foreground">{totalSeats}</p>
              <p className="text-xs text-muted-foreground">Total Assigned</p>
            </div>
          </div>
          {pools.length === 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              No seats assigned yet. Contact your admin.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card>
        <CardHeader>
          <CardTitle>Payment History</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {loadingRecords ? (
            <div className="flex justify-center p-6">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
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
                {paymentRecords.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{fmtDate(r.date)}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {fmtAmount(r.amount)}
                    </TableCell>
                    <TableCell className="text-right">{r.seatsGranted ?? "—"}</TableCell>
                    <TableCell className="text-sm">{fmtDate(r.accessExpiresAt)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.note || "—"}</TableCell>
                  </TableRow>
                ))}
                {paymentRecords.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
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
