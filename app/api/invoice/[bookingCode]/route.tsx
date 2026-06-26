// app/api/invoice/[bookingCode]/route.tsx
// Generates a fresh PDF on every request. No storage involved.
// Public endpoint so WhatsApp / email links also work; booking_code itself
// gates access (6+ char hash, not enumerable).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoicePDF, type BookingForInvoice } from "@/lib/invoice-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bookingCode: string }> }
) {
  const { bookingCode } = await params;

  if (!/^[A-Z0-9-]{6,20}$/i.test(bookingCode)) {
    return new NextResponse("Invalid booking code", { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: booking, error } = await supabase
    .from("bookings")
    .select(
      `
      booking_code, guest_name, phone, email,
      check_in, check_out, nights,
      paid_amount, balance, total_amount,
      rooms_subtotal, addons_subtotal, discount_amount,
      created_at,
      booking_rooms (
        rate_per_night, nights, guests,
        rooms ( room_number, room_type )
      ),
      payments ( amount, mode )
    `
    )
    .eq("booking_code", bookingCode)
    .single();

  if (error || !booking) {
    return new NextResponse("Booking not found", { status: 404 });
  }

  try {
    const buffer = await renderToBuffer(
      <InvoicePDF booking={booking as unknown as BookingForInvoice} />
    );

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Invoice-${bookingCode}.pdf"`,
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch (e) {
    console.error("PDF generation failed", e);
    return new NextResponse("PDF generation failed", { status: 500 });
  }
}
