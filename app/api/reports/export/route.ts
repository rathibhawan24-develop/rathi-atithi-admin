import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { canViewReports } from "@/lib/types";
import type { PaymentMode } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const MODE_LABEL: Record<PaymentMode, string> = {
  upi: "UPI",
  cash: "Cash",
  bank: "Bank transfer",
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// rows may be empty (zero bookings in range) — headers is the fallback so
// the sheet still has a header row instead of being blank.
function xlsxResponse(
  filename: string,
  sheets: Array<{ name: string; rows: Record<string, unknown>[]; headers: string[] }>
): NextResponse {
  const wb = XLSX.utils.book_new();
  for (const { name, rows, headers } of sheets) {
    const sheet =
      rows.length > 0
        ? XLSX.utils.json_to_sheet(rows)
        : XLSX.utils.aoa_to_sheet([headers]);
    XLSX.utils.book_append_sheet(wb, sheet, name);
  }
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

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

  if (
    !type ||
    !["bookings", "payments", "outstanding", "invoices"].includes(type)
  ) {
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
    .eq("id", user.id)
    .maybeSingle();
  const role = (profileRow?.role ?? null) as Parameters<typeof canViewReports>[0];
  if (!canViewReports(role)) {
    return new NextResponse("Permission denied", { status: 403 });
  }
  // Invoice export carries GST-filing data — admin only, tighter than the
  // rest of the Reports page (which manager/viewer can also see).
  if (type === "invoices" && role !== "admin") {
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

  if (type === "invoices") {
    // total_amount is GST-inclusive (locked requirement) — back-calculate
    // the pre-tax amount and the 5% GST split from it rather than storing
    // or recomputing tax anywhere else.
    const { data, error } = await supabase
      .from("bookings")
      .select("id, booking_code, guest_name, total_amount, checked_out_at")
      .eq("status", "checked_out")
      .gte("checked_out_at", fromISO)
      .lte("checked_out_at", toISO)
      .order("checked_out_at", { ascending: true });
    if (error) return new NextResponse(error.message, { status: 500 });

    const bookings = (data ?? []) as unknown as Array<{
      id: string;
      booking_code: string;
      guest_name: string;
      total_amount: number;
      checked_out_at: string;
    }>;

    const INVOICE_HEADERS = [
      "Invoice Number", "Amount (before tax)", "GST 5%", "Total Amount",
      "Payment Mode", "Guest Name", "Check-out Date",
    ];
    const RECON_HEADERS = [
      "Booking Code", "Guest Name", "Total Paid", "Cash", "UPI", "Bank",
      "Check-out Date",
    ];
    const filename = `invoices_${from!.replace(/-/g, "")}_${to!.replace(/-/g, "")}.xlsx`;

    if (bookings.length === 0) {
      return xlsxResponse(filename, [
        { name: "Invoices", rows: [], headers: INVOICE_HEADERS },
        { name: "Payment reconciliation", rows: [], headers: RECON_HEADERS },
      ]);
    }

    // Payment breakdown per booking — modes in first-paid order (for the
    // Invoices sheet's "UPI, Cash" style summary) and per-mode totals (for
    // the reconciliation sheet).
    const bookingIds = bookings.map((b) => b.id);
    const { data: paymentRows, error: payErr } = await supabase
      .from("payments")
      .select("booking_id, mode, amount, paid_at")
      .in("booking_id", bookingIds)
      .order("paid_at", { ascending: true });
    if (payErr) return new NextResponse(payErr.message, { status: 500 });

    const modesByBooking = new Map<string, string[]>();
    const totalsByBooking = new Map<
      string,
      { total: number; cash: number; upi: number; bank: number }
    >();
    for (const p of (paymentRows ?? []) as unknown as Array<{
      booking_id: string;
      mode: PaymentMode;
      amount: number;
    }>) {
      const seen = modesByBooking.get(p.booking_id) ?? [];
      if (!seen.includes(p.mode)) seen.push(p.mode);
      modesByBooking.set(p.booking_id, seen);

      const t = totalsByBooking.get(p.booking_id) ?? {
        total: 0, cash: 0, upi: 0, bank: 0,
      };
      const amt = Number(p.amount);
      t.total += amt;
      t[p.mode] += amt;
      totalsByBooking.set(p.booking_id, t);
    }

    const invoiceRows = bookings.map((b) => {
      const total = Number(b.total_amount);
      const beforeTax = round2(total / 1.05);
      const gst = round2(total - beforeTax);
      const modes = modesByBooking.get(b.id);
      return {
        "Invoice Number": b.booking_code,
        "Amount (before tax)": beforeTax,
        "GST 5%": gst,
        "Total Amount": total,
        "Payment Mode": modes?.length
          ? modes.map((m) => MODE_LABEL[m as PaymentMode]).join(", ")
          : "Not recorded",
        "Guest Name": b.guest_name,
        "Check-out Date": formatDate(b.checked_out_at).replace(/ /g, "-"),
      };
    });

    const reconRows = bookings.map((b) => {
      const t = totalsByBooking.get(b.id);
      return {
        "Booking Code": b.booking_code,
        "Guest Name": b.guest_name,
        "Total Paid": t ? round2(t.total) : "Not recorded",
        "Cash": t ? round2(t.cash) : 0,
        "UPI": t ? round2(t.upi) : 0,
        "Bank": t ? round2(t.bank) : 0,
        "Check-out Date": formatDate(b.checked_out_at).replace(/ /g, "-"),
      };
    });

    return xlsxResponse(filename, [
      { name: "Invoices", rows: invoiceRows, headers: INVOICE_HEADERS },
      { name: "Payment reconciliation", rows: reconRows, headers: RECON_HEADERS },
    ]);
  }

  return new NextResponse("Invalid type", { status: 400 });
}
