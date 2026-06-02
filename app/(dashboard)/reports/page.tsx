import Link from "next/link";
import {
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  format,
  parseISO,
} from "date-fns";
import {
  FileBarChart,
  IndianRupee,
  AlertCircle,
  CalendarCheck,
  Wallet,
  Landmark,
  Smartphone,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import type { PaymentMode } from "@/lib/types";
import { requirePermission } from "@/lib/auth/permissions";
import { canViewReports } from "@/lib/types";

export const dynamic = "force-dynamic";

type SearchParams = {
  date?: string;
  month?: string;
};

function parseDateParam(d: string | undefined): string {
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return format(new Date(), "yyyy-MM-dd");
}

function parseMonthParam(m: string | undefined): string {
  if (m && /^\d{4}-\d{2}$/.test(m)) return m;
  return format(new Date(), "yyyy-MM");
}

const MODE_LABEL: Record<PaymentMode, string> = {
  upi: "UPI",
  cash: "Cash",
  bank: "Bank transfer",
};

const MODE_ICON: Record<
  PaymentMode,
  React.ComponentType<{ className?: string }>
> = {
  upi: Smartphone,
  cash: Wallet,
  bank: Landmark,
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requirePermission(canViewReports, "/");

  const supabase = createClient();
  const dailyDate = parseDateParam(searchParams.date);
  const monthStr = parseMonthParam(searchParams.month);
  const monthStart = startOfMonth(parseISO(`${monthStr}-01`));
  const monthEnd = endOfMonth(monthStart);

  const dayStart = startOfDay(parseISO(dailyDate));
  const dayEnd = endOfDay(parseISO(dailyDate));

  // Daily payments
  const dailyPaymentsRes = await supabase
    .from("payments")
    .select(
      `id, amount, mode, reference_number, notes, paid_at,
       booking:bookings ( id, booking_code, guest_name )`
    )
    .gte("paid_at", dayStart.toISOString())
    .lte("paid_at", dayEnd.toISOString())
    .order("paid_at", { ascending: true });

  type DailyPayment = {
    id: string;
    amount: number | string;
    mode: PaymentMode;
    reference_number: string | null;
    notes: string | null;
    paid_at: string;
    booking: { id: string; booking_code: string; guest_name: string } | null;
  };
  const dailyPayments = (dailyPaymentsRes.data ?? []) as unknown as DailyPayment[];

  const dailyByMode: Record<PaymentMode, { count: number; total: number }> = {
    upi: { count: 0, total: 0 },
    cash: { count: 0, total: 0 },
    bank: { count: 0, total: 0 },
  };
  let dailyGross = 0;
  let dailyRefunds = 0;
  for (const p of dailyPayments) {
    const amt = Number(p.amount);
    dailyByMode[p.mode].count += 1;
    dailyByMode[p.mode].total += amt;
    if (amt >= 0) dailyGross += amt;
    else dailyRefunds += Math.abs(amt);
  }
  const dailyNet = dailyGross - dailyRefunds;

  // Outstanding balances — active bookings with money owed
  const outstandingRes = await supabase
    .from("bookings")
    .select(
      "id, booking_code, guest_name, phone, check_in, check_out, status, total_amount, paid_amount, balance"
    )
    .in("status", ["pending", "confirmed", "checked_in"])
    .gt("balance", 0)
    .order("balance", { ascending: false })
    .limit(50);

  type Outstanding = {
    id: string;
    booking_code: string;
    guest_name: string;
    phone: string;
    check_in: string;
    check_out: string;
    status: string;
    total_amount: number | string;
    paid_amount: number | string;
    balance: number | string;
  };
  const outstanding = (outstandingRes.data ?? []) as unknown as Outstanding[];
  const outstandingTotal = outstanding.reduce(
    (sum, b) => sum + Number(b.balance),
    0
  );

  // Monthly: payments + bookings in the month
  const [monthlyPaymentsRes, monthlyBookingsRes, monthlyCheckInsRes] =
    await Promise.all([
      supabase
        .from("payments")
        .select("amount, mode")
        .gte("paid_at", monthStart.toISOString())
        .lte("paid_at", monthEnd.toISOString()),
      supabase
        .from("bookings")
        .select("id, total_amount, status, source", { count: "exact" })
        .gte("created_at", monthStart.toISOString())
        .lte("created_at", monthEnd.toISOString()),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .gte("checked_in_at", monthStart.toISOString())
        .lte("checked_in_at", monthEnd.toISOString()),
    ]);

  let monthlyNet = 0;
  const monthlyByMode: Record<PaymentMode, number> = { upi: 0, cash: 0, bank: 0 };
  for (const p of monthlyPaymentsRes.data ?? []) {
    const amt = Number(p.amount);
    monthlyNet += amt;
    monthlyByMode[p.mode as PaymentMode] += amt;
  }

  const monthlyBookingsCount = monthlyBookingsRes.count ?? 0;
  const monthlyCheckInsCount = monthlyCheckInsRes.count ?? 0;
  const monthlyBookingsRevenue =
    monthlyBookingsRes.data?.reduce(
      (sum, b) =>
        b.status !== "cancelled" && b.status !== "expired"
          ? sum + Number(b.total_amount)
          : sum,
      0
    ) ?? 0;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl md:text-4xl tracking-tight flex items-center gap-3">
          <FileBarChart className="h-7 w-7 text-primary" />
          Reports
        </h1>
        <p className="text-muted-foreground mt-1">
          Daily reconciliation, outstanding balances, and monthly summary.
        </p>
      </header>

      {/* === DAILY RECONCILIATION === */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-primary" />
              Daily reconciliation
            </CardTitle>
            <CardDescription>
              All payments and refunds dated on this calendar day.
            </CardDescription>
          </div>
          <form method="GET" className="flex items-center gap-2">
            <input type="hidden" name="month" value={monthStr} />
            <input
              type="date"
              name="date"
              defaultValue={dailyDate}
              className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
            <Button type="submit" size="sm">
              Go
            </Button>
          </form>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Net collected
              </p>
              <p className="text-xl font-semibold tabular-nums mt-1">
                {formatCurrency(dailyNet)}
              </p>
              {dailyRefunds > 0 && (
                <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                  {formatCurrency(dailyGross)} − {formatCurrency(dailyRefunds)}{" "}
                  refunded
                </p>
              )}
            </div>
            {(["cash", "upi", "bank"] as PaymentMode[]).map((m) => {
              const Icon = MODE_ICON[m];
              return (
                <div key={m} className="rounded-md border p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" />
                    {MODE_LABEL[m]}
                  </p>
                  <p className="text-xl font-semibold tabular-nums mt-1">
                    {formatCurrency(dailyByMode[m].total)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {dailyByMode[m].count}{" "}
                    {dailyByMode[m].count === 1 ? "entry" : "entries"}
                  </p>
                </div>
              );
            })}
          </div>

          {dailyPayments.length === 0 ? (
            <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
              No payments recorded on{" "}
              {format(parseISO(dailyDate), "d MMM yyyy")}.
            </div>
          ) : (
            <div className="rounded-md border divide-y text-sm">
              {dailyPayments.map((p) => {
                const amt = Number(p.amount);
                const isRefund = amt < 0;
                const Icon = MODE_ICON[p.mode];
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors"
                  >
                    <div
                      className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                        isRefund
                          ? "bg-warning/15 text-warning-foreground"
                          : "bg-success/15 text-success"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium tabular-nums">
                          {formatCurrency(Math.abs(amt))}
                        </span>
                        <Badge
                          variant={isRefund ? "warning" : "muted"}
                          className="text-[10px]"
                        >
                          {isRefund ? "Refund" : "Payment"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {MODE_LABEL[p.mode]}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                        {p.booking && (
                          <Link
                            href={`/bookings/${p.booking.id}`}
                            className="hover:text-primary transition-colors"
                          >
                            {p.booking.guest_name} ·{" "}
                            <span className="font-mono">
                              {p.booking.booking_code}
                            </span>
                          </Link>
                        )}
                        <span>{format(parseISO(p.paid_at), "h:mm a")}</span>
                        {p.reference_number && (
                          <span className="font-mono">
                            Ref: {p.reference_number}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* === OUTSTANDING BALANCES === */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            Outstanding balances
          </CardTitle>
          <CardDescription>
            Active bookings with money still owed.{" "}
            {outstanding.length > 0 && (
              <span className="font-medium text-foreground">
                Total: {formatCurrency(outstandingTotal)} across{" "}
                {outstanding.length} booking
                {outstanding.length === 1 ? "" : "s"}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {outstanding.length === 0 ? (
            <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
              No bookings have an outstanding balance. 🎉
            </div>
          ) : (
            <div className="rounded-md border divide-y text-sm">
              {outstanding.map((b) => (
                <Link
                  key={b.id}
                  href={`/bookings/${b.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{b.guest_name}</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {b.booking_code}
                      </span>
                      <Badge variant="muted" className="text-[10px]">
                        {b.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(b.check_in)} → {formatDate(b.check_out)} · {b.phone}
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <p className="font-semibold text-destructive">
                      {formatCurrency(Number(b.balance))}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      of {formatCurrency(Number(b.total_amount))}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* === MONTHLY SUMMARY === */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-primary" />
              Monthly summary
            </CardTitle>
            <CardDescription>
              {format(monthStart, "MMMM yyyy")}
            </CardDescription>
          </div>
          <form method="GET" className="flex items-center gap-2">
            <input type="hidden" name="date" value={dailyDate} />
            <input
              type="month"
              name="month"
              defaultValue={monthStr}
              className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
            <Button type="submit" size="sm">
              Go
            </Button>
          </form>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-md border p-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Net collected
            </p>
            <p className="text-xl font-semibold tabular-nums mt-1">
              {formatCurrency(monthlyNet)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Payments minus refunds
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Bookings created
            </p>
            <p className="text-xl font-semibold tabular-nums mt-1">
              {monthlyBookingsCount}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {formatCurrency(monthlyBookingsRevenue)} booked value
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Check-ins
            </p>
            <p className="text-xl font-semibold tabular-nums mt-1">
              {monthlyCheckInsCount}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Guests who arrived
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              By mode
            </p>
            <div className="text-[11px] mt-1 space-y-0.5 tabular-nums">
              <div className="flex justify-between">
                <span>Cash</span>
                <span>{formatCurrency(monthlyByMode.cash)}</span>
              </div>
              <div className="flex justify-between">
                <span>UPI</span>
                <span>{formatCurrency(monthlyByMode.upi)}</span>
              </div>
              <div className="flex justify-between">
                <span>Bank</span>
                <span>{formatCurrency(monthlyByMode.bank)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
