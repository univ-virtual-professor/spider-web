import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@shared/lib/firebase";
import { useAuth } from "@app/providers/AuthProvider";

import {
  DsPageHeader,
  DsCard,
  DsCardHeader,
  DsKpiRow,
  DsTableHead,
  DsTableRow,
} from "@shared/ui/ds";

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
  const totalSeatsSafe = totalSeats || 1;

  return (
    <div className="space-y-5 font-ds-sans">
      <DsPageHeader
        title="Billing"
        subtitle="Your seat allocation and payment history. To add more seats, contact your admin."
      />

      <DsKpiRow
        items={[
          {
            label: "Available",
            value: String(totalAvailable),
            tone: "positive",
            pct: (totalAvailable / totalSeatsSafe) * 100,
          },
          {
            label: "In use",
            value: String(totalInUse),
            tone: "accent",
            pct: (totalInUse / totalSeatsSafe) * 100,
          },
          { label: "Total assigned", value: String(totalSeats), tone: "slate", pct: 100 },
        ]}
      />

      {pools.length > 0 && (
        <DsCard className="p-4">
          <div className="mb-3 font-ds-sans text-[13.5px] font-semibold text-ds-ink">
            Usage by plan
          </div>
          {pools.map((p) => {
            const pct = p.totalSeats ? (p.allocatedSeats / p.totalSeats) * 100 : 0;
            return (
              <div key={p.planId} className="mb-3 last:mb-0">
                <div className="flex items-baseline">
                  <div className="font-ds-sans text-[12.5px] font-medium text-ds-ink">
                    {p.planName}
                  </div>
                  <div className="flex-1" />
                  <div className="font-ds-mono text-[11.5px] text-ds-ink/50">
                    {p.allocatedSeats} / {p.totalSeats}
                  </div>
                </div>
                <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-ds-fill">
                  <div
                    className="h-full rounded-full bg-ds-info"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </DsCard>
      )}
      {pools.length === 0 && (
        <DsCard className="p-8 text-center">
          <p className="font-ds-sans text-[12.5px] text-ds-slate">
            No seats assigned yet. Contact your admin.
          </p>
        </DsCard>
      )}

      <DsCard className="overflow-hidden">
        <DsCardHeader title="Payment history" />
        {loadingRecords ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-ds-slate" />
          </div>
        ) : paymentRecords.length === 0 ? (
          <p className="py-8 text-center font-ds-sans text-[12.5px] text-ds-slate">
            No payment history yet.
          </p>
        ) : (
          <>
            <DsTableHead
              columns={["Date", "Amount", "Seats", "Access until", "Note"]}
              cols="1fr 1fr .7fr 1fr 1.3fr"
            />
            {paymentRecords.map((r) => (
              <DsTableRow key={r.id} cols="1fr 1fr .7fr 1fr 1.3fr">
                <div className="font-ds-mono text-[11.5px] text-ds-ink/60">{fmtDate(r.date)}</div>
                <div className="font-semibold">{fmtAmount(r.amount)}</div>
                <div className="font-ds-mono text-[12px]">{r.seatsGranted ?? "—"}</div>
                <div className="font-ds-mono text-[11.5px] text-ds-ink/60">
                  {fmtDate(r.accessExpiresAt)}
                </div>
                <div className="truncate text-ds-ink/50">{r.note || "—"}</div>
              </DsTableRow>
            ))}
          </>
        )}
      </DsCard>
    </div>
  );
}
