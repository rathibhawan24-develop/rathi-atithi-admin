/**
 * Sends booking lifecycle WhatsApp messages via Fillracks (GrowthAccel API
 * wrapper around Meta's WhatsApp Cloud API).
 *
 * Architecture mirrors send-booking-email.ts — same shape so the calling
 * code can fire-and-forget both in parallel.
 *
 * Templates are pre-approved by Meta. Each lifecycle stage maps to one
 * template name (the `type` field in the Fillracks payload). Stages without
 * an approved template silently skip — easy to extend as more templates get
 * approved.
 *
 * Idempotency:
 *   notifications_sent jsonb on the booking row tracks both channels with
 *   distinct keys so each is independent:
 *     email: "received", "confirmed", "checked_in", "checked_out", "cancelled"
 *     whatsapp: "whatsapp_received", "whatsapp_confirmed", ...
 *
 * Resilience:
 *   Outbound fetch uses fetchWithRetry — bounded retries on network errors
 *   only (no retry on non-2xx HTTP since the server actively rejected). Per
 *   attempt has an AbortController timeout so we never hang forever.
 *
 * Visibility:
 *   Every terminal outcome (sent / failed / skipped) is also written to
 *   bookings.notification_log via logNotificationAttempt, so the admin UI
 *   can show delivery status per stage per channel.
 */

import { createClient } from "@supabase/supabase-js";
import type { EmailStage } from "./email-templates";
import { logNotificationAttempt } from "./notification-log";

// Retry tuning. Total worst-case execution time =
//   MAX_ATTEMPTS * FETCH_TIMEOUT_MS + (MAX_ATTEMPTS - 1) * RETRY_BACKOFF_MS
// With 2 attempts at 5s + 1s backoff this is ~11s, well under the route's
// 30s maxDuration limit set in the route handler.
const FETCH_TIMEOUT_MS = 5000;
const RETRY_BACKOFF_MS = 1000;
const MAX_ATTEMPTS = 2;

const FILLRACKS_API_KEY = process.env.FILLRACKS_API_KEY;
const FILLRACKS_ENDPOINT =
  process.env.FILLRACKS_ENDPOINT ||
  "https://quickapi.fillracks.com/api/v1/sendtextmessage";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Stage → Fillracks template `type` value. Set to null for stages that don't
 * have an approved Meta template yet — they'll silently skip. Once a template
 * is approved by Meta, just plug the type string in here and that stage
 * starts firing.
 */
const STAGE_TO_TEMPLATE: Record<EmailStage, string | null> = {
  received: "bookingconfirmation",
  confirmed: "bookingconfirmed",
  checked_in: "bookingcheckin",
  checked_out: "bookingthankyou",
  cancelled: "bookingcancelled",
};

export type SendResult =
  | { ok: true; skipped?: boolean; reason?: string }
  | { ok: false; error: string };

/** Normalise a phone to "+91XXXXXXXXXX". Handles 10-digit, 91-prefixed, or
 *  already-formatted inputs. */
function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("91")) return `+${digits}`;
  return digits ? `+${digits}` : "";
}

/** ISO "2026-06-15" → "15-06-2026" (DD-MM-YYYY format the template uses). */
function formatDate(iso: string): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

/** fetch with per-attempt timeout + bounded retries. Only retries on network
 *  / abort errors (not on non-2xx HTTP), since the latter means the server
 *  actively rejected the request and a retry would just get the same reject. */
async function fetchWithRetry(
  url: string,
  init: RequestInit
): Promise<{ resp: Response; attempts: number }> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const resp = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      return { resp, attempts: attempt };
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function sendBookingWhatsapp(
  bookingId: string,
  stage: EmailStage,
  options?: { force?: boolean }
): Promise<SendResult> {
  const force = options?.force === true;

  if (!FILLRACKS_API_KEY) {
    await logNotificationAttempt(bookingId, "whatsapp", stage, {
      status: "skipped",
      attempts: 0,
      reason: "no_api_key",
    });
    return {
      ok: false,
      error: "FILLRACKS_API_KEY not configured — WhatsApp is disabled.",
    };
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return { ok: false, error: "Supabase service role not configured." };
  }

  const template = STAGE_TO_TEMPLATE[stage];
  if (!template) {
    await logNotificationAttempt(bookingId, "whatsapp", stage, {
      status: "skipped",
      attempts: 0,
      reason: `no_whatsapp_template_for_${stage}`,
    });
    return {
      ok: true,
      skipped: true,
      reason: `no_whatsapp_template_for_${stage}`,
    };
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Fetch booking + booking_rooms so we can compute total guest count
  const { data: booking, error: fetchErr } = await supabase
    .from("bookings")
    .select(
      `
      id, booking_code, guest_name, phone,
      check_in, check_out, nights,
      paid_amount, balance,
      notifications_sent,
      booking_rooms ( guests ),
      payments ( mode, amount )
    `
    )
    .eq("id", bookingId)
    .single();

  if (fetchErr || !booking) {
    return {
      ok: false,
      error: `Booking ${bookingId} not found: ${fetchErr?.message ?? "unknown"}`,
    };
  }

  if (!booking.phone) {
    await logNotificationAttempt(bookingId, "whatsapp", stage, {
      status: "skipped",
      attempts: 0,
      reason: "no_phone_on_booking",
    });
    return { ok: true, skipped: true, reason: "no_phone_on_booking" };
  }

  const sentKey = `whatsapp_${stage}`;
  const alreadySent: string[] = Array.isArray(booking.notifications_sent)
    ? (booking.notifications_sent as string[])
    : [];
  if (!force && alreadySent.includes(sentKey)) {
    return { ok: true, skipped: true, reason: "already_sent" };
  }

  // Sum guests across all rooms in this booking
  const totalGuests =
    (booking.booking_rooms as unknown as Array<{ guests: number | null }>)
      ?.reduce((sum, br) => sum + (Number(br.guests) || 0), 0) ?? 0;

  // Build the payload. Fillracks WhatsApp config maps each template `type`
  // to a Meta template name and exposes named variables. All 5 booking-
  // lifecycle templates share the same variable schema for simplicity:
  //   customer_name, booking_id, checkin_date, checkout_date, guest_count
  // Stage-specific fields. Confirmation message includes advance + due,
  // checkout (thank you) message includes total paid + the modes used.
  // Fillracks ignores any field that isn't declared on the template config,
  // so we can ship these freely.
  const paid = Number(booking.paid_amount ?? 0);
  const due = Number(booking.balance ?? 0);
  const modeLabel = (m: string): string =>
    m === "upi" ? "UPI" : m === "cash" ? "Cash" : m === "bank" ? "Bank" : m;
  const modesUsed = Array.from(
    new Set(
      (
        (booking.payments ?? []) as unknown as Array<{
          mode: string;
          amount: number | string;
        }>
      )
        .filter((px) => Number(px.amount) > 0)
        .map((px) => modeLabel(px.mode))
    )
  ).join(", ");

  const stageExtras: Record<string, string> = {};
  if (stage === "confirmed") {
    stageExtras.advance_paid = Math.round(paid).toString();
    stageExtras.due_amount = Math.round(due).toString();
  } else if (stage === "checked_out") {
    stageExtras.total_paid = Math.round(paid).toString();
    stageExtras.payment_mode = modesUsed || "N/A";
    stageExtras.invoice_url = `https://admin.rathiatithibhawan.org/i/${booking.booking_code}`;
  }

  const payload = {
    to: formatPhone(booking.phone),
    type: template,
    customer_name: booking.guest_name,
    booking_id: booking.booking_code,
    checkin_date: formatDate(booking.check_in),
    checkout_date: formatDate(booking.check_out),
    guest_count: String(Math.max(1, totalGuests)),
    ...stageExtras,
  };

  let resp: Response;
  let attempts = 1;
  try {
    const out = await fetchWithRetry(FILLRACKS_ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": FILLRACKS_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    resp = out.resp;
    attempts = out.attempts;
  } catch (e) {
    const error = `Fillracks network error after ${MAX_ATTEMPTS} attempts: ${e instanceof Error ? e.message : String(e)}`;
    await logNotificationAttempt(bookingId, "whatsapp", stage, {
      status: "failed",
      attempts: MAX_ATTEMPTS,
      error,
    });
    return { ok: false, error };
  }

  // Fillracks returns 202 with { status: "success", jobId } for successful
  // queue acceptance. Anything else is an error.
  if (!resp.ok) {
    let detail = "";
    try {
      detail = await resp.text();
    } catch {
      // ignore
    }
    const error = `Fillracks HTTP ${resp.status}: ${detail.slice(0, 300)}`;
    await logNotificationAttempt(bookingId, "whatsapp", stage, {
      status: "failed",
      attempts,
      error,
    });
    return { ok: false, error };
  }

  // Parse so we can log the jobId — useful if the user later asks "did it
  // actually deliver?" The jobId is what Fillracks support uses to look it up.
  let jobId: string | undefined;
  try {
    const json = await resp.json();
    if (json && typeof json === "object" && "jobId" in json) {
      jobId = String((json as { jobId: unknown }).jobId);
    }
  } catch {
    // ignore — response might be plain text
  }

  // Mark stage as sent. Use Set semantics so force-resend doesn't dupe.
  // Failure to update notifications_sent is logged but doesn't bubble up —
  // the message was already accepted by Fillracks.
  const nextSent = Array.from(new Set([...alreadySent, sentKey]));
  const { error: updateErr } = await supabase
    .from("bookings")
    .update({ notifications_sent: nextSent })
    .eq("id", bookingId);

  if (updateErr) {
    console.warn(
      `[whatsapp] Sent ${stage} booking=${bookingId} jobId=${jobId} but failed to update notifications_sent: ${updateErr.message}`
    );
  } else {
    console.log(
      `[whatsapp] Sent ${stage} booking=${bookingId} jobId=${jobId} attempts=${attempts}`
    );
  }

  // Write the detailed status to notification_log for admin visibility
  await logNotificationAttempt(bookingId, "whatsapp", stage, {
    status: "sent",
    attempts,
    jobId,
  });

  return { ok: true };
}
