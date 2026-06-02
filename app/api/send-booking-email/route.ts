/**
 * POST /api/send-booking-email
 *
 * Triggers a transactional email for a booking lifecycle stage.
 * Called by:
 *   - The customer site (https://rathiatithibhawan.org) after the
 *     create_booking RPC returns. Uses CORS.
 *   - Internal admin server actions (server-to-server, same origin, no CORS
 *     needed).
 *
 * Body: { booking_id: uuid, stage: "received"|"confirmed"|"checked_in"|"checked_out" }
 *
 * Security model: this is intentionally callable without auth from the
 * customer site origin. The action is rate-limited by Resend's quota and is
 * idempotent per (booking_id, stage). Worst-case abuse = an attacker triggers
 * already-sent stages, which the idempotency guard discards.
 */

import { NextRequest, NextResponse } from "next/server";
import { sendBookingEmail } from "@/lib/send-booking-email";
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
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
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

  const result = await sendBookingEmail(bookingId, stage);

  if (!result.ok) {
    // Log on server but don't expose internal details to caller.
    console.error(
      `[email] booking=${bookingId} stage=${stage} failed: ${result.error}`
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
