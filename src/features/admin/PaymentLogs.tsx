import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Card, CardContent } from "@shared/ui/card";
import { Paginator } from "@shared/ui/Paginator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/ui/table";
import { Badge } from "@shared/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";

const API = import.meta.env.VITE_MONKEY_KING_API_URL;
const ADMIN_KEY = import.meta.env.VITE_MONKEY_KING_ADMIN_KEY;

type PaymentLog = {
  id: number;
  educator_id: string;
  batch_id: string;
  plan_id: string;
  cashfree_order_id: string;
  cashfree_payment_id: string | null;
  amount: number;
  discount_amount: number;
  seats_purchased: number;
  coupon_code: string | null;
  status: "PENDING" | "SUCCESS" | "FAILED";
  created_at: string;
};

async function fetchLogs(offset = 0): Promise<PaymentLog[]> {
  const res = await fetch(`${API}/api/payment/admin/logs?limit=100&offset=${offset}`, {
    headers: { Authorization: `Bearer ${ADMIN_KEY}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive"> = {
  SUCCESS: "default",
  PENDING: "secondary",
  FAILED: "destructive",
};

function fmtAmount(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 0 })}`;
}

const PAGE_SIZE = 25;

export default function PaymentLogs() {
  const [logs, setLogs] = useState<PaymentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchLogs();
      setLogs(data);
    } catch (e: any) {
      toast.error(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q
      ? logs.filter(
          (l) =>
            l.educator_id.toLowerCase().includes(q) ||
            l.cashfree_order_id.toLowerCase().includes(q) ||
            l.status.toLowerCase().includes(q) ||
            (l.coupon_code || "").toLowerCase().includes(q)
        )
      : logs;
  }, [search, logs]);

  // Reset page when search changes
  useEffect(() => {
    setPage(1);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Payment Logs</h1>
          <p className="text-sm text-muted-foreground">All Cashfree payment transactions</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex gap-4">
        <Input
          placeholder="Search educator ID, order ID, status, coupon..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Educator</TableHead>
                  <TableHead>Seats</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Coupon</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.cashfree_order_id}</TableCell>
                    <TableCell className="text-xs">{l.educator_id}</TableCell>
                    <TableCell>{l.seats_purchased}</TableCell>
                    <TableCell>{fmtAmount(l.amount)}</TableCell>
                    <TableCell>
                      {l.discount_amount > 0 ? fmtAmount(l.discount_amount) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.coupon_code || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_COLORS[l.status] ?? "secondary"}>{l.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(l.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      No records found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
          {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
        </span>
        <Paginator page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}
