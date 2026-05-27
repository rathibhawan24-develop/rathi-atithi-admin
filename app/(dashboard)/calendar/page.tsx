import React from "react";
import Link from "next/link";
import { parseISO, format, addDays } from "date-fns";
import { ChevronLeft, ChevronRight, CalendarRange } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BookingStatus, Room } from "@/lib/types";

export const dynamic = "force-dynamic";

const TYPE_ORDER = ["Supreme", "4 Bed", "Deluxe", "Sudama 6 Bed"];

type CellBooking = {
  bookingId: string;
  bookingCode: string;
  guestName: string;
  status: BookingStatus;
  checkIn: string;
  checkOut: string;
};

type SearchParams = {
  start?: string;
  days?: string;
};

function todayIso(): string {
  const now = new Date();
  return format(now, "yyyy-MM-dd");
}

function parseSearchParams(params: SearchParams) {
  let days = parseInt(params.days || "14", 10);
  if (![7, 14, 30, 60, 90, 180].includes(days)) days = 14;

  let startStr = params.start ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr)) {
    startStr = todayIso();
  }

  const startDate = parseISO(startStr);
  const dates: Date[] = Array.from({ length: days }, (_, i) =>
    addDays(startDate, i)
  );
  const endStr = format(addDays(startDate, days), "yyyy-MM-dd");
  return { startStr, endStr, dates, days };
}

async function getCalendarData(startStr: string, endStr: string) {
  const supabase = createClient();

  const [roomsRes, bookingsRes] = await Promise.all([
    supabase
      .from("rooms")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
    supabase
      .from("bookings")
      .select(
        `
        id, booking_code, guest_name, status, check_in, check_out,
        booking_rooms ( room_id )
      `
      )
      .in("status", ["pending", "confirmed", "checked_in"])
      .lt("check_in", endStr)
      .gt("check_out", startStr),
  ]);

  return {
    rooms: (roomsRes.data ?? []) as Room[],
    bookings: (bookingsRes.data ?? []) as Array<{
      id: string;
      booking_code: string;
      guest_name: string;
      status: BookingStatus;
      check_in: string;
      check_out: string;
      booking_rooms: Array<{ room_id: string }>;
    }>,
  };
}

function buildLookup(
  bookings: Array<{
    id: string;
    booking_code: string;
    guest_name: string;
    status: BookingStatus;
    check_in: string;
    check_out: string;
    booking_rooms: Array<{ room_id: string }>;
  }>
): Map<string, Map<string, CellBooking>> {
  const lookup = new Map<string, Map<string, CellBooking>>();
  for (const b of bookings) {
    for (const br of b.booking_rooms) {
      let perRoom = lookup.get(br.room_id);
      if (!perRoom) {
        perRoom = new Map();
        lookup.set(br.room_id, perRoom);
      }
      // Iterate each date in [check_in, check_out)
      let d = parseISO(b.check_in);
      const out = parseISO(b.check_out);
      while (d < out) {
        const dateStr = format(d, "yyyy-MM-dd");
        perRoom.set(dateStr, {
          bookingId: b.id,
          bookingCode: b.booking_code,
          guestName: b.guest_name,
          status: b.status,
          checkIn: b.check_in,
          checkOut: b.check_out,
        });
        d = addDays(d, 1);
      }
    }
  }
  return lookup;
}

function statusCellClasses(status: BookingStatus): string {
  switch (status) {
    case "pending":
      return "bg-warning/20 hover:bg-warning/30 text-warning-foreground";
    case "confirmed":
      return "bg-primary/20 hover:bg-primary/30 text-primary";
    case "checked_in":
      return "bg-success/20 hover:bg-success/30 text-success";
    default:
      return "bg-muted hover:bg-muted/80 text-muted-foreground";
  }
}

function statusLabel(status: BookingStatus): string {
  return {
    pending: "Pending",
    confirmed: "Confirmed",
    checked_in: "Checked in",
    checked_out: "Checked out",
    cancelled: "Cancelled",
    no_show: "No-show",
    expired: "Expired",
  }[status];
}

function CalendarLegend() {
  const items: { status: BookingStatus; label: string }[] = [
    { status: "pending", label: "Pending" },
    { status: "confirmed", label: "Confirmed" },
    { status: "checked_in", label: "Checked in" },
  ];
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {items.map((item) => (
        <div key={item.status} className="flex items-center gap-1.5">
          <span
            className={cn(
              "inline-block h-3 w-3 rounded-sm",
              statusCellClasses(item.status).split(" ")[0]
            )}
          />
          <span>{item.label}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-sm bg-primary/10 border border-primary/30" />
        <span>Today</span>
      </div>
    </div>
  );
}

function DateNavigation({
  startStr,
  days,
}: {
  startStr: string;
  days: number;
}) {
  const prevStart = format(addDays(parseISO(startStr), -days), "yyyy-MM-dd");
  const nextStart = format(addDays(parseISO(startStr), days), "yyyy-MM-dd");
  const today = todayIso();

  return (
    <form
      method="GET"
      className="flex flex-wrap items-center gap-2"
    >
      <Button asChild variant="outline" size="icon" type="button">
        <Link href={`/calendar?start=${prevStart}&days=${days}`} aria-label="Previous">
          <ChevronLeft />
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm" type="button">
        <Link href={`/calendar?start=${today}&days=${days}`}>Today</Link>
      </Button>
      <Button asChild variant="outline" size="icon" type="button">
        <Link href={`/calendar?start=${nextStart}&days=${days}`} aria-label="Next">
          <ChevronRight />
        </Link>
      </Button>

      <div className="flex items-center gap-2 ml-2">
        <input
          type="date"
          name="start"
          defaultValue={startStr}
          className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Start date"
        />
        <select
          name="days"
          defaultValue={String(days)}
          className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Days to show"
        >
          <option value="7">7 days</option>
          <option value="14">14 days</option>
          <option value="30">30 days</option>
          <option value="60">2 months</option>
          <option value="90">3 months</option>
          <option value="180">6 months</option>
        </select>
        <Button type="submit" size="sm">
          Go
        </Button>
      </div>
    </form>
  );
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { startStr, endStr, dates, days } = parseSearchParams(searchParams);
  const { rooms, bookings } = await getCalendarData(startStr, endStr);
  const lookup = buildLookup(bookings);
  const today = todayIso();

  // Group rooms by type, preserving display order
  const grouped: Record<string, Room[]> = {};
  for (const room of rooms) {
    (grouped[room.room_type] ??= []).push(room);
  }
  const orderedTypes = [
    ...TYPE_ORDER.filter((t) => grouped[t]),
    ...Object.keys(grouped)
      .filter((t) => !TYPE_ORDER.includes(t))
      .sort(),
  ];

  const dateCount = dates.length;

  // For ranges > 30 days, switch to compact mode: narrower cells, no guest
  // names in cells, simpler date headers. Designed for spotting open/booked
  // patterns rather than reading individual bookings.
  const isCompact = days > 30;
  const cellMinPx = isCompact ? 28 : 72;
  const labelColPx = isCompact ? 140 : 180;
  const cellHeightClass = isCompact ? "min-h-[30px]" : "min-h-[44px]";

  // Grid columns: 1 fixed-width room label + N date columns.
  // Using inline style because Tailwind can't generate dynamic grid templates.
  const gridStyle = {
    gridTemplateColumns: `${labelColPx}px repeat(${dateCount}, minmax(${cellMinPx}px, 1fr))`,
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight flex items-center gap-3">
            <CalendarRange className="h-7 w-7 text-primary" />
            Calendar
          </h1>
          <p className="text-muted-foreground mt-1">
            {format(parseISO(startStr), "d MMM yyyy")} —{" "}
            {format(addDays(parseISO(startStr), days - 1), "d MMM yyyy")} ·{" "}
            {rooms.length} rooms
          </p>
        </div>
        <DateNavigation startStr={startStr} days={days} />
      </header>

      <CalendarLegend />

      <Card>
        <CardContent className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <div className="grid min-w-fit text-sm" style={gridStyle}>
              {/* Header row: blank corner + date headers */}
              <div className="sticky left-0 z-20 bg-card border-r border-b border-border px-3 py-2 text-xs uppercase tracking-wider font-medium text-muted-foreground">
                Room
              </div>
              {dates.map((d) => {
                const dateStr = format(d, "yyyy-MM-dd");
                const isTodayCol = dateStr === today;
                const dow = d.getDay();
                const isWeekend = dow === 0 || dow === 6;
                const isFirstOfMonth = d.getDate() === 1;
                return (
                  <div
                    key={`h-${dateStr}`}
                    className={cn(
                      "border-b border-border text-center",
                      isCompact ? "px-0.5 py-1" : "px-1 py-2 text-[11px]",
                      isWeekend && "bg-muted/40",
                      isTodayCol &&
                        "bg-primary/10 text-primary font-medium border-x border-primary/40",
                      isFirstOfMonth && isCompact && "border-l-2 border-l-foreground/40"
                    )}
                  >
                    {isCompact ? (
                      <>
                        {(isFirstOfMonth || dateStr === today) && (
                          <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">
                            {format(d, "MMM")}
                          </div>
                        )}
                        <div className="tabular-nums text-[10px] font-medium">
                          {d.getDate()}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="uppercase tracking-wider">
                          {format(d, "EEE")}
                        </div>
                        <div className="tabular-nums font-medium mt-0.5">
                          {format(d, "d MMM")}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {/* Rooms grouped by type */}
              {orderedTypes.map((type) => (
                <React.Fragment key={`section-${type}`}>
                  <div
                    className="bg-muted/50 px-3 py-1.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground border-b border-border"
                    style={{ gridColumn: `1 / -1` }}
                  >
                    {type} · {grouped[type].length} room
                    {grouped[type].length === 1 ? "" : "s"}
                  </div>

                  {grouped[type].map((room) => (
                    <React.Fragment key={`row-${room.id}`}>
                      <Link
                        href={`/rooms/${room.id}`}
                        className={cn(
                          "sticky left-0 z-10 bg-card border-r border-b border-border hover:bg-muted/40 transition-colors flex flex-col justify-center",
                          isCompact ? "px-2 py-1" : "px-3 py-2",
                          cellHeightClass
                        )}
                      >
                        <div className={cn("font-medium", isCompact ? "text-[11px]" : "text-xs")}>
                          #{room.room_number}
                        </div>
                        {!isCompact && (
                          <div className="text-[11px] text-muted-foreground truncate">
                            {room.name}
                          </div>
                        )}
                      </Link>

                      {dates.map((d) => {
                        const dateStr = format(d, "yyyy-MM-dd");
                        const dow = d.getDay();
                        const isWeekend = dow === 0 || dow === 6;
                        const isTodayCol = dateStr === today;
                        const booking = lookup.get(room.id)?.get(dateStr);

                        if (booking) {
                          const isFirstDay = booking.checkIn === dateStr;
                          return (
                            <Link
                              key={`c-${room.id}-${dateStr}`}
                              href={`/bookings/${booking.bookingId}`}
                              title={`${booking.guestName} · ${
                                booking.bookingCode
                              } · ${statusLabel(booking.status)}`}
                              className={cn(
                                "border-b border-border truncate transition-colors flex items-center",
                                cellHeightClass,
                                isCompact ? "px-0" : "px-1.5 py-2 text-[11px]",
                                statusCellClasses(booking.status),
                                isTodayCol && "ring-1 ring-inset ring-primary/40"
                              )}
                            >
                              {!isCompact && (
                                <span className="truncate">
                                  {isFirstDay ? booking.guestName : "·"}
                                </span>
                              )}
                            </Link>
                          );
                        }
                        return (
                          <div
                            key={`c-${room.id}-${dateStr}`}
                            className={cn(
                              "border-b border-border",
                              cellHeightClass,
                              isWeekend && "bg-muted/30",
                              isTodayCol && "bg-primary/5"
                            )}
                          />
                        );
                      })}
                    </React.Fragment>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {bookings.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No bookings in this date range. The grid shows all active rooms — click
          any room to edit it, or scroll dates to find bookings.
        </p>
      )}

      <Badge variant="muted" className="text-[10px]">
        Tip: click a colored cell to jump to that booking. Click a room label to
        edit room details.
      </Badge>
    </div>
  );
}
