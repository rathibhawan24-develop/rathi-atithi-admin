import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canViewReports } from "@/lib/types";

// Tiny CSV helper. Quotes only fields that need it (commas, quotes, newlines).
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

function csvResponse(filename: string, content: string): NextResponse {
  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function isValidDate(s: string | null): boolean {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type");
  const from = sp.get("from");
  const to = sp.get("to");

  if (!type || !["bookings", "payments", "outstanding"].includes(type)) {
    return new NextResponse("Invalid 'type' parameter", { status: 400 });
  }
  if (!isValidDate(from) || !isValidDate(to)) {
    return new NextResponse("from and to must be YYYY-MM-DD", { status: 400 });
  }
  if (to! < from!) {
    return new NextResponse("to must be on/after from", { status: 400 });
  }

  // Auth + role check
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Authentication required", { status: 401 });
  }
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  const role = (profileRow?.role ?? null) as Parameters<typeof canViewReports>[0];
  if (!canViewReports(role)) {
    return new NextResponse("Permission denied", { status: 403 });
  }

  const fromISO = `${from}T00:00:00.000Z`;
  const toISO = `${to}T23:59:59.999Z`;

  if (type === "bookings") {
    const { data, error } = await supabase
      .from("bookings")
      .select(
        `id, booking_code, status, source, created_at,
         guest_name, phone, email,
         check_in, check_out, nights,
         rooms_subtotal, addons_subtotal, discount_amount, total_amount,
         paid_amount, balance,
         booking_rooms ( rate_per_night, nights, guests, room:rooms ( room_number, room_type ) )`
      )
      .gte("created_at", fromISO)
      .lte("created_at", toISO)
      .order("created_at", { ascending: true });

    if (error) return new NextResponse(error.message, { status: 500 });

    const header = [
      "Booking code", "Created", "Status", "Source",
      "Guest name", "Phone", "Email",
      "Check-in", "Check-out", "Nights",
      "Room numbers", "Rooms", "Room subtotal", "Addons subtotal", "Discount", "Total",
      "Paid", "Balance",
    ];
    const lines = [csvRow(header)];
    for (const b of (data ?? []) as unknown as Array<{
      booking_code: string; created_at: string; status: string; source: string | null;
      guest_name: string; phone: string; email: string | null;
      check_in: string; check_out: string; nights: number;
      rooms_subtotal: number; addons_subtotal: number; discount_amount: number;
      total_amount: number; paid_amount: number; balance: number;
      booking_rooms: Array<{ room: { room_number: string; room_type: string } | null }>;
    }>) {
      const roomNumbers = (b.booking_rooms ?? [])
        .map((br) => br.room?.room_number)
        .filter(Boolean)
        .map((n) => `#${n}`)
        .join(", ");
      const roomsLabel = (b.booking_rooms ?? [])
        .map((br) =>
          br.room ? `#${br.room.room_number} (${br.room.room_type})` : ""
        )
        .filter(Boolean)
        .join("; ");
      lines.push(
        csvRow([
          b.booking_code,
          b.created_at,
          b.status,
          b.source ?? "",
          b.guest_name,
          b.phone,
          b.email ?? "",
          b.check_in,
          b.check_out,
          b.nights,
          roomNumbers,
          roomsLabel,
          b.rooms_subtotal,
          b.addons_subtotal,
          b.discount_amount,
          b.total_amount,
          b.paid_amount,
          b.balance,
        ])
      );
    }
    return csvResponse(
      `rathi-bookings-${from}-to-${to}.csv`,
      lines.join("\n")
    );
  }

  if (type === "payments") {
    const { data, error } = await supabase
      .from("payments")
      .select(
        `id, amount, mode, reference_number, notes, paid_at,
         booking:bookings ( booking_code, guest_name, phone )`
      )
      .gte("paid_at", fromISO)
      .lte("paid_at", toISO)
      .order("paid_at", { ascending: true });
    if (error) return new NextResponse(error.message, { status: 500 });

    const header = [
      "Date", "Booking code", "Guest name", "Phone", "Amount",
      "Type", "Mode", "Reference", "Notes",
    ];
    const lines = [csvRow(header)];
    for (const p of (data ?? []) as unknown as Array<{
      amount: number; mode: string; reference_number: string | null;
      notes: string | null; paid_at: string;
      booking: { booking_code: string; guest_name: string; phone: string } | null;
    }>) {
      const amt = Number(p.amount);
      lines.push(
        csvRow([
          p.paid_at,
          p.booking?.booking_code ?? "",
          p.booking?.guest_name ?? "",
          p.booking?.phone ?? "",
          Math.abs(amt),
          amt >= 0 ? "Payment" : "Refund",
          p.mode,
          p.reference_number ?? "",
          p.notes ?? "",
        ])
      );
    }
    return csvResponse(
      `rathi-payments-${from}-to-${to}.csv`,
      lines.join("\n")
    );
  }

  if (type === "outstanding") {
    // Outstanding doesn't really use the date range — it's a snapshot of
    // current open bookings with balance. We still include the range in the
    // filename for context.
    const { data, error } = await supabase
      .from("bookings")
      .select(
        `booking_code, guest_name, phone, status,
         check_in, check_out, total_amount, paid_amount, balance`
      )
      .in("status", ["pending", "confirmed", "checked_in"])
      .gt("balance", 0)
      .order("balance", { ascending: false });
    if (error) return new NextResponse(error.message, { status: 500 });

    const header = [
      "Booking code", "Guest name", "Phone", "Status",
      "Check-in", "Check-out", "Total", "Paid", "Balance owed",
    ];
    const lines = [csvRow(header)];
    for (const b of (data ?? []) as unknown as Array<{
      booking_code: string; guest_name: string; phone: string; status: string;
      check_in: string; check_out: string;
      total_amount: number; paid_amount: number; balance: number;
    }>) {
      lines.push(
        csvRow([
          b.booking_code,
          b.guest_name,
          b.phone,
          b.status,
          b.check_in,
          b.check_out,
          b.total_amount,
          b.paid_amount,
          b.balance,
        ])
      );
    }
    return csvResponse(
      `rathi-outstanding-${from}-to-${to}.csv`,
      lines.join("\n")
    );
  }

  return new NextResponse("Invalid type", { status: 400 });
}
