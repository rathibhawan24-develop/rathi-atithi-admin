/**
 * POST /api/send-booking-whatsapp
 *
 * Mirror of /api/send-booking-email — triggers a WhatsApp message for a
 * booking lifecycle stage via Fillracks.
 *
 * Called by:
 *   - Customer site after create_booking RPC returns (fire-and-forget, CORS)
 *   - Admin server actions when status changes (server-to-server, same origin)
 *
 * Body: { booking_id: uuid, stage: "received"|"confirmed"|"checked_in"|"checked_out"|"cancelled" }
 *
 * Idempotent per (booking_id, stage) — repeated calls are no-ops.
 */

import { NextRequest, NextResponse } from "next/server";
import { sendBookingWhatsapp } from "@/lib/send-booking-whatsapp";
import type { EmailStage } from "@/lib/email-templates";

const ALLOWED_ORIGINS = [
  "https://rathiatithibhawan.org",
  "https://www.rathiatithibhawan.org",
];

const VALID_STAGES: EmailStage[] = [
  "received",
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  let body: { booking_id?: string; stage?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers }
    );
  }

  const bookingId = body.booking_id;
  const stage = body.stage as EmailStage | undefined;

  if (!bookingId || typeof bookingId !== "string") {
    return NextResponse.json(
      { ok: false, error: "booking_id required" },
      { status: 400, headers }
    );
  }
  if (!stage || !VALID_STAGES.includes(stage)) {
    return NextResponse.json(
      { ok: false, error: `stage must be one of: ${VALID_STAGES.join(", ")}` },
      { status: 400, headers }
    );
  }

  const result = await sendBookingWhatsapp(bookingId, stage);

  if (!result.ok) {
    console.error(
      `[whatsapp] booking=${bookingId} stage=${stage} failed: ${result.error}`
    );
    return NextResponse.json(
      { ok: false, error: "Send failed" },
      { status: 500, headers }
    );
  }

  return NextResponse.json(
    { ok: true, skipped: result.skipped, reason: result.reason },
    { status: 200, headers }
  );
}
