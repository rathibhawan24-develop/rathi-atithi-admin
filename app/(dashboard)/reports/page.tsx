import {
  FileBarChart,
  IndianRupee,
  CalendarCheck,
  Wallet,
  Landmark,
  Smartphone,
  Users,
  TrendingUp,
  Building2,
  Globe,
  Phone,
  Tag,
  Ban,
  Bed,
  CircleDollarSign,
  CheckCircle2,
  AlertCircle,
  Percent} from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth, differenceInDays } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, cn } from "@/lib/utils";
import type { PaymentMode } from "@/lib/types";
import { requirePermission } from "@/lib/auth/permissions";
import { canViewReports } from "@/lib/types";
import { DateFilter } from "./date-filter";
import { ExportButtons } from "./export-buttons";

export const dynamic = "force-dynamic";

type SearchParams = { from?: string; to?: string };

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function parseRange(searchParams: SearchParams): { from: string; to: string } {
  const isYmd = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  // Default: current month from day 1 to today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const from = isYmd(searchParams.from)
    ? searchParams.from!
    : ymd(startOfMonth(today));
  const to = isYmd(searchParams.to) ? searchParams.to! : ymd(today);
  return { from, to };
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

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No-show",
  expired: "Expired",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  confirmed: "bg-primary/15 text-primary border-primary/30",
  checked_in: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  checked_out: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
  no_show: "bg-destructive/10 text-destructive border-destructive/30",
  expired: "bg-muted text-muted-foreground border-border",
};

// Compute overlap nights between [a_in, a_out) and [b_from, b_to_inclusive]
function overlapNights(
  aIn: string,
  aOut: string,
  bFrom: string,
  bTo: string
): number {
  // Treat all as YYYY-MM-DD dates; check_out is exclusive.
  const a1 = new Date(aIn + "T00:00:00").getTime();
  const a2 = new Date(aOut + "T00:00:00").getTime();
  const b1 = new Date(bFrom + "T00:00:00").getTime();
  // bTo is inclusive — add a day to make it exclusive
  const bToDate = new Date(bTo + "T00:00:00");
  bToDate.setDate(bToDate.getDate() + 1);
  const b2 = bToDate.getTime();
  const overlapMs = Math.min(a2, b2) - Math.max(a1, b1);
  return Math.max(0, Math.floor(overlapMs / 86_400_000));
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requirePermission(canViewReports, "/");

  const supabase = createClient();
  const { from, to } = parseRange(searchParams);
  const fromISO = `${from}T00:00:00.000Z`;
  const toISO = `${to}T23:59:59.999Z`;
  const daysInRange = differenceInDays(parseISO(to), parseISO(from)) + 1;

  // --- Parallel data fetch ----------------------------------------------------
  const [
    bookingsCreatedRes,
    bookingsOverlappingRes,
    paymentsRes,
    outstandingRes,
    activeRoomsRes,
    allBookingPhonesEarlierRes,
  ] = await Promise.all([
    // Bookings CREATED in the range — used for booking counts, sources,
    // new-vs-repeat, revenue components
    supabase
      .from("bookings")
      .select(
        "id, phone, source, status, rooms_subtotal, addons_subtotal, discount_amount, total_amount, paid_amount, created_at, checked_in_at"
      )
      .gte("created_at", fromISO)
      .lte("created_at", toISO),

    // Bookings whose stay OVERLAPS the range — used for room-nights occupied
    supabase
      .from("bookings")
      .select(
        `id, check_in, check_out, status,
         booking_rooms ( rate_per_night, nights, room_id )`
      )
      .lte("check_in", to)
      .gt("check_out", from)
      .not("status", "in", "(cancelled,no_show,expired)"),

    // Payments in the range
    supabase
      .from("payments")
      .select("amount, mode, paid_at")
      .gte("paid_at", fromISO)
      .lte("paid_at", toISO),

    // Current outstanding balances (snapshot, not range-bound)
    supabase
      .from("bookings")
      .select(
        "id, booking_code, guest_name, phone, check_in, check_out, status, total_amount, paid_amount, balance"
      )
      .in("status", ["pending", "confirmed", "checked_in"])
      .gt("balance", 0)
      .order("balance", { ascending: false })
      .limit(20),

    // Active rooms count (for occupancy denominator)
    supabase.from("rooms").select("id", { count: "exact", head: true }).eq("is_active", true),

    // Phones that have bookings created BEFORE the range start — used to
    // classify each phone in the range as "new" or "repeat"
    supabase
      .from("bookings")
      .select("phone")
      .lt("created_at", fromISO),
  ]);

  // --- KPIs -----------------------------------------------------------------
  type BookingInRange = {
    id: string;
    phone: string;
    source: string | null;
    status: string;
    rooms_subtotal: number | string;
    addons_subtotal: number | string;
    discount_amount: number | string;
    total_amount: number | string;
    paid_amount: number | string;
    created_at: string;
    checked_in_at: string | null;
  };
  const bookingsInRange = (bookingsCreatedRes.data ??
    []) as unknown as BookingInRange[];

  const totalBookings = bookingsInRange.length;
  const checkInsInRange = bookingsInRange.filter((b) => {
    if (!b.checked_in_at) return false;
    const d = b.checked_in_at.slice(0, 10);
    return d >= from && d <= to;
  }).length;

  // Active (non-cancelled, non-no-show) bookings for revenue
  const activeBookings = bookingsInRange.filter(
    (b) => b.status !== "cancelled" && b.status !== "no_show" && b.status !== "expired"
  );
  const grossRoomsRevenue = activeBookings.reduce(
    (s, b) => s + Number(b.rooms_subtotal),
    0
  );
  const grossAddonsRevenue = activeBookings.reduce(
    (s, b) => s + Number(b.addons_subtotal),
    0
  );
  const totalDiscountsGiven = activeBookings.reduce(
    (s, b) => s + Number(b.discount_amount),
    0
  );
  const netRevenue = activeBookings.reduce(
    (s, b) => s + Number(b.total_amount),
    0
  );

  // Payments collected
  type PaymentRow = { amount: number | string; mode: PaymentMode; paid_at: string };
  const payments = (paymentsRes.data ?? []) as unknown as PaymentRow[];
  let netPayments = 0;
  let grossPayments = 0;
  let refundsTotal = 0;
  const byMode: Record<PaymentMode, { count: number; total: number }> = {
    upi: { count: 0, total: 0 },
    cash: { count: 0, total: 0 },
    bank: { count: 0, total: 0 },
  };
  for (const p of payments) {
    const amt = Number(p.amount);
    netPayments += amt;
    if (amt >= 0) {
      grossPayments += amt;
      byMode[p.mode].count += 1;
      byMode[p.mode].total += amt;
    } else {
      refundsTotal += Math.abs(amt);
    }
  }

  // Occupancy and ADR — based on overlapping stays
  type BookingOverlap = {
    id: string;
    check_in: string;
    check_out: string;
    status: string;
    booking_rooms: Array<{
      rate_per_night: number | string;
      nights: number;
      room_id: string;
    }>;
  };
  const overlapBookings = (bookingsOverlappingRes.data ??
    []) as unknown as BookingOverlap[];

  let roomNightsOccupied = 0;
  let roomRevenueInRange = 0;
  for (const b of overlapBookings) {
    const nightsInRange = overlapNights(b.check_in, b.check_out, from, to);
    if (nightsInRange === 0) continue;
    for (const br of b.booking_rooms ?? []) {
      roomNightsOccupied += nightsInRange;
      roomRevenueInRange += Number(br.rate_per_night) * nightsInRange;
    }
  }

  const activeRoomsCount = activeRoomsRes.count ?? 0;
  const totalAvailableRoomNights = activeRoomsCount * daysInRange;
  const occupancyPct =
    totalAvailableRoomNights > 0
      ? (roomNightsOccupied / totalAvailableRoomNights) * 100
      : 0;
  const adr = roomNightsOccupied > 0 ? roomRevenueInRange / roomNightsOccupied : 0;
  const revPar =
    totalAvailableRoomNights > 0 ? roomRevenueInRange / totalAvailableRoomNights : 0;

  // New vs repeat customers
  const earlierPhones = new Set(
    ((allBookingPhonesEarlierRes.data ?? []) as { phone: string }[])
      .map((r) => r.phone)
      .filter(Boolean)
  );
  // Track per-phone first appearance in this range to count uniques
  const phoneSeenInRange = new Map<string, "new" | "repeat">();
  let newBookingsCount = 0;
  let repeatBookingsCount = 0;
  for (const b of bookingsInRange) {
    const ph = b.phone;
    if (!ph) continue;
    if (!phoneSeenInRange.has(ph)) {
      phoneSeenInRange.set(ph, earlierPhones.has(ph) ? "repeat" : "new");
    }
    if (earlierPhones.has(ph)) repeatBookingsCount += 1;
    else newBookingsCount += 1;
  }
  const uniqueGuests = phoneSeenInRange.size;
  const newUniqueGuests = [...phoneSeenInRange.values()].filter(
    (v) => v === "new"
  ).length;
  const repeatUniqueGuests = uniqueGuests - newUniqueGuests;
  const repeatRatePct =
    uniqueGuests > 0 ? (repeatUniqueGuests / uniqueGuests) * 100 : 0;

  // Source breakdown
  // Source breakdown — accept the actual source values in use:
  //   web      → customer site (online)
  //   walk_in  → admin walk-in
  //   phone    → admin phone booking
  //   other    → anything else (imports, legacy, unknown)
  type SrcKey = "web" | "walk_in" | "phone" | "other";
  const sourceMap: Record<SrcKey, { count: number; revenue: number }> = {
    web: { count: 0, revenue: 0 },
    walk_in: { count: 0, revenue: 0 },
    phone: { count: 0, revenue: 0 },
    other: { count: 0, revenue: 0 },
  };
  for (const b of bookingsInRange) {
    const src = b.source ?? "";
    const key: SrcKey =
      src === "web" || src === "online"
        ? "web"
        : src === "walk_in"
        ? "walk_in"
        : src === "phone"
        ? "phone"
        : "other";
    sourceMap[key].count += 1;
    if (
      b.status !== "cancelled" &&
      b.status !== "no_show" &&
      b.status !== "expired"
    ) {
      sourceMap[key].revenue += Number(b.total_amount);
    }
  }

  // Status distribution
  const statusCounts: Record<string, number> = {};
  for (const b of bookingsInRange) {
    statusCounts[b.status] = (statusCounts[b.status] ?? 0) + 1;
  }

  // Outstanding
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
    (s, b) => s + Number(b.balance),
    0
  );

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl md:text-4xl tracking-tight flex items-center gap-3">
              <FileBarChart className="h-7 w-7 text-primary" />
              Reports
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {format(parseISO(from), "d MMM yyyy")} –{" "}
              {format(parseISO(to), "d MMM yyyy")} · {daysInRange} day
              {daysInRange === 1 ? "" : "s"}
            </p>
          </div>
          <ExportButtons from={from} to={to} />
        </div>
        <DateFilter from={from} to={to} />
      </header>

      {/* ============ KPI CARDS ============ */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard
          label="Bookings"
          value={totalBookings.toLocaleString("en-IN")}
          icon={CalendarCheck}
          hint={`${newBookingsCount} new · ${repeatBookingsCount} repeat`}
        />
        <KpiCard
          label="Check-ins"
          value={checkInsInRange.toLocaleString("en-IN")}
          icon={Building2}
          hint="Arrivals in range"
        />
        <KpiCard
          label="Room-nights"
          value={roomNightsOccupied.toLocaleString("en-IN")}
          icon={Bed}
          hint={`of ${totalAvailableRoomNights.toLocaleString("en-IN")} available`}
        />
        <KpiCard
          label="Revenue"
          value={formatCurrency(netRevenue)}
          icon={IndianRupee}
          hint="Net (post-discount), excludes cancelled"
        />
        <KpiCard
          label="Payments"
          value={formatCurrency(netPayments)}
          icon={CircleDollarSign}
          hint={`${formatCurrency(grossPayments)} − ${formatCurrency(
            refundsTotal
          )} refunds`}
        />
        <KpiCard
          label="Occupancy"
          value={`${occupancyPct.toFixed(1)}%`}
          icon={Percent}
          hint={`ADR ${formatCurrency(adr)} · RevPAR ${formatCurrency(revPar)}`}
        />
      </div>

      {/* ============ CUSTOMERS + SOURCES ============ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Customers
            </CardTitle>
            <CardDescription>
              Counted from the phone number on each booking.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatRow
              label="New guests"
              value={`${newUniqueGuests}`}
              sub={`${newBookingsCount} booking${
                newBookingsCount === 1 ? "" : "s"
              }`}
            />
            <StatRow
              label="Returning guests"
              value={`${repeatUniqueGuests}`}
              sub={`${repeatBookingsCount} booking${
                repeatBookingsCount === 1 ? "" : "s"
              }`}
            />
            <StatRow label="Unique guests" value={`${uniqueGuests}`} />
            <StatRow
              label="Repeat rate"
              value={`${repeatRatePct.toFixed(1)}%`}
              sub="returning ÷ unique"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Sources
            </CardTitle>
            <CardDescription>
              Where bookings came from in this range.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <SourceRow
              icon={Globe}
              label="Customer site (online)"
              count={sourceMap.web.count}
              revenue={sourceMap.web.revenue}
            />
            <SourceRow
              icon={Building2}
              label="Walk-in"
              count={sourceMap.walk_in.count}
              revenue={sourceMap.walk_in.revenue}
            />
            {sourceMap.phone.count > 0 && (
              <SourceRow
                icon={Phone}
                label="Phone booking"
                count={sourceMap.phone.count}
                revenue={sourceMap.phone.revenue}
              />
            )}
            {sourceMap.other.count > 0 && (
              <SourceRow
                icon={Tag}
                label="Other / imported"
                count={sourceMap.other.count}
                revenue={sourceMap.other.revenue}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ============ REVENUE + PAYMENTS BREAKDOWN ============ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-primary" />
              Revenue breakdown
            </CardTitle>
            <CardDescription>
              Active bookings only (excludes cancelled / no-show).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <StatRow label="Rooms" value={formatCurrency(grossRoomsRevenue)} />
            <StatRow label="Add-ons" value={formatCurrency(grossAddonsRevenue)} />
            {totalDiscountsGiven > 0 && (
              <StatRow
                label="Discounts given"
                value={`− ${formatCurrency(totalDiscountsGiven)}`}
                valueClassName="text-primary"
              />
            )}
            <div className="pt-2 border-t border-border">
              <StatRow
                label="Net revenue"
                value={formatCurrency(netRevenue)}
                valueClassName="text-lg font-semibold"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              Payment collection
            </CardTitle>
            <CardDescription>
              Money actually received in this range.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {(["upi", "cash", "bank"] as PaymentMode[]).map((m) => {
              const Icon = MODE_ICON[m];
              return (
                <div
                  key={m}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span>{MODE_LABEL[m]}</span>
                    <span className="text-xs text-muted-foreground">
                      ({byMode[m].count}
                      {" "}
                      {byMode[m].count === 1 ? "entry" : "entries"})
                    </span>
                  </div>
                  <span className="text-sm font-medium tabular-nums">
                    {formatCurrency(byMode[m].total)}
                  </span>
                </div>
              );
            })}
            {refundsTotal > 0 && (
              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-sm text-destructive">Refunds issued</span>
                <span className="text-sm font-medium tabular-nums text-destructive">
                  − {formatCurrency(refundsTotal)}
                </span>
              </div>
            )}
            <div className="pt-2 border-t border-border">
              <StatRow
                label="Net collected"
                value={formatCurrency(netPayments)}
                valueClassName="text-lg font-semibold"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ============ STATUS DISTRIBUTION ============ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Booking status distribution
          </CardTitle>
          <CardDescription>
            All bookings created in this range, by current status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {totalBookings === 0 ? (
            <p className="text-sm text-muted-foreground italic py-2">
              No bookings created in this range.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {Object.entries(statusCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => (
                  <Badge
                    key={status}
                    variant="outline"
                    className={cn(
                      "px-3 py-1.5 text-sm gap-1.5",
                      STATUS_COLOR[status] ??
                        "bg-muted text-muted-foreground border-border"
                    )}
                  >
                    {STATUS_LABEL[status] ?? status}
                    <span className="font-semibold ml-1">{count}</span>
                  </Badge>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============ OUTSTANDING BALANCES ============ */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-primary" />
                Outstanding balances
              </CardTitle>
              <CardDescription>
                Active bookings with money owed (current snapshot, not
                range-bound).
              </CardDescription>
            </div>
            {outstanding.length > 0 && (
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Total owed
                </p>
                <p className="text-lg font-semibold tabular-nums">
                  {formatCurrency(outstandingTotal)}
                </p>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {outstanding.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-2">
              No outstanding balances. All active bookings are paid up.
            </p>
          ) : (
            <div className="rounded-md border divide-y text-sm">
              {outstanding.map((b) => (
                <a
                  key={b.id}
                  href={`/bookings/${b.id}`}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-2.5 hover:bg-muted/40 transition-colors"
                >
                  <div>
                    <p className="font-medium">{b.guest_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.booking_code} · {b.phone} ·{" "}
                      {format(parseISO(b.check_in), "d MMM")}–
                      {format(parseISO(b.check_out), "d MMM")}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 text-[10px]",
                      STATUS_COLOR[b.status]
                    )}
                  >
                    {STATUS_LABEL[b.status] ?? b.status}
                  </Badge>
                  <p className="text-sm font-semibold tabular-nums text-destructive shrink-0">
                    {formatCurrency(Number(b.balance))}
                  </p>
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Small presentational helpers ------------------------------------------

function KpiCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-2xl font-semibold tabular-nums mt-2">{value}</p>
        {hint && (
          <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
            {hint}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatRow({
  label,
  value,
  sub,
  valueClassName,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div>
        <span className="text-sm">{label}</span>
        {sub && (
          <span className="text-xs text-muted-foreground ml-2">{sub}</span>
        )}
      </div>
      <span className={cn("text-sm font-medium tabular-nums", valueClassName)}>
        {value}
      </span>
    </div>
  );
}

function SourceRow({
  icon: Icon,
  label,
  count,
  revenue,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  revenue: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span>{label}</span>
        <span className="text-xs text-muted-foreground">
          ({count}
          {" "}
          {count === 1 ? "booking" : "bookings"})
        </span>
      </div>
      <span className="text-sm font-medium tabular-nums">
        {formatCurrency(revenue)}
      </span>
    </div>
  );
}
