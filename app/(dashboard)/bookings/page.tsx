import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  CalendarDays,
  Plus,
  Search,
  FilterX,
  Phone,
  Mail,
  IndianRupee,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import type { Booking, BookingStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No-show",
  expired: "Expired",
};

const STATUS_VARIANT: Record<
  BookingStatus,
  "default" | "success" | "warning" | "destructive" | "muted" | "secondary"
> = {
  pending: "warning",
  confirmed: "default",
  checked_in: "success",
  checked_out: "muted",
  cancelled: "destructive",
  no_show: "destructive",
  expired: "muted",
};

type SearchParams = {
  status?: string;
  q?: string;
  from?: string;
  to?: string;
};

async function getBookings(params: SearchParams) {
  const supabase = createClient();
  let query = supabase
    .from("bookings")
    .select(
      "id, booking_code, guest_name, phone, email, check_in, check_out, nights, total_amount, paid_amount, balance, status, source, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (
    params.status &&
    Object.keys(STATUS_LABELS).includes(params.status)
  ) {
    query = query.eq("status", params.status);
  }

  if (params.from) {
    query = query.gte("check_in", params.from);
  }
  if (params.to) {
    query = query.lte("check_in", params.to);
  }

  if (params.q && params.q.trim()) {
    const q = params.q.trim();
    // search by name, phone, or booking code
    query = query.or(
      `guest_name.ilike.%${q}%,phone.ilike.%${q}%,booking_code.ilike.%${q}%`
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error("Failed to load bookings:", error);
    return [] as Booking[];
  }
  return (data ?? []) as Booking[];
}

function FilterBar({ params }: { params: SearchParams }) {
  const hasFilters = !!(params.status || params.q || params.from || params.to);
  const statusOptions: Array<{ value: string; label: string }> = [
    { value: "", label: "All statuses" },
    ...Object.entries(STATUS_LABELS).map(([value, label]) => ({
      value,
      label,
    })),
  ];

  return (
    <form
      method="GET"
      className="flex flex-col md:flex-row gap-2 items-stretch md:items-center"
    >
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search by name, phone, or booking code"
          className="flex h-10 w-full pl-9 pr-3 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <select
        name="status"
        defaultValue={params.status ?? ""}
        className="flex h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {statusOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <input
        type="date"
        name="from"
        defaultValue={params.from ?? ""}
        className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
        title="Check-in from"
      />
      <input
        type="date"
        name="to"
        defaultValue={params.to ?? ""}
        className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
        title="Check-in to"
      />
      <Button type="submit">Filter</Button>
      {hasFilters && (
        <Button asChild variant="outline" type="button">
          <Link href="/bookings">
            <FilterX />
            Clear
          </Link>
        </Button>
      )}
    </form>
  );
}

function BookingRow({ booking }: { booking: Booking }) {
  return (
    <div className="border-b border-border last:border-b-0 px-4 py-3 hover:bg-muted/40 transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm">{booking.guest_name}</p>
            <Badge
              variant={STATUS_VARIANT[booking.status]}
              className="text-[10px] uppercase tracking-wider"
            >
              {STATUS_LABELS[booking.status]}
            </Badge>
            {booking.source === "walk_in" && (
              <Badge variant="outline" className="text-[10px]">
                Walk-in
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            <span className="font-mono">{booking.booking_code}</span>
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3" /> {booking.phone}
            </span>
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3 w-3" /> {booking.email}
            </span>
          </div>
        </div>

        <div className="text-sm">
          <p className="tabular-nums">
            {formatDate(booking.check_in)} → {formatDate(booking.check_out)}
          </p>
          <p className="text-xs text-muted-foreground">
            {booking.nights} night{booking.nights === 1 ? "" : "s"}
          </p>
        </div>

        <div className="text-right min-w-[110px]">
          <p className="text-sm font-semibold tabular-nums">
            {formatCurrency(Number(booking.total_amount))}
          </p>
          <p
            className={cn(
              "text-xs tabular-nums",
              Number(booking.balance) > 0
                ? "text-destructive"
                : "text-success"
            )}
          >
            {Number(booking.balance) > 0
              ? `${formatCurrency(Number(booking.balance))} due`
              : "Fully paid"}
          </p>
        </div>
      </div>
    </div>
  );
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const bookings = await getBookings(searchParams);
  const hasFilters = !!(
    searchParams.status ||
    searchParams.q ||
    searchParams.from ||
    searchParams.to
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight flex items-center gap-3">
            <CalendarDays className="h-7 w-7 text-primary" />
            Bookings
          </h1>
          <p className="text-muted-foreground mt-1">
            {bookings.length === 100
              ? "Showing latest 100"
              : `${bookings.length} booking${bookings.length === 1 ? "" : "s"}`}
            {hasFilters && " · filtered"}
          </p>
        </div>
        <Button asChild>
          <Link href="/bookings/new">
            <Plus />
            New walk-in
          </Link>
        </Button>
      </header>

      <FilterBar params={searchParams} />

      <Card>
        <CardContent className="p-0">
          {bookings.length === 0 ? (
            <div className="py-16 text-center">
              <IndianRupee className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="mt-3 font-medium">
                {hasFilters
                  ? "No bookings match those filters"
                  : "No bookings yet"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {hasFilters ? (
                  <Link
                    href="/bookings"
                    className="text-primary underline"
                  >
                    Clear filters
                  </Link>
                ) : (
                  <>
                    Create your first walk-in booking to see it here.
                  </>
                )}
              </p>
              {!hasFilters && (
                <Button asChild className="mt-4">
                  <Link href="/bookings/new">
                    <Plus />
                    Create walk-in
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div>
              {bookings.map((b) => (
                <BookingRow key={b.id} booking={b} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
