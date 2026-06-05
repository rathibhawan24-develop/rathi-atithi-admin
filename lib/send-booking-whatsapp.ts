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
 */

import { createClient } from "@supabase/supabase-js";
import type { EmailStage } from "./email-templates";

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

export async function sendBookingWhatsapp(
  bookingId: string,
  stage: EmailStage
): Promise<SendResult> {
  if (!FILLRACKS_API_KEY) {
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
      notifications_sent,
      booking_rooms ( guests )
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
    return { ok: true, skipped: true, reason: "no_phone_on_booking" };
  }

  const sentKey = `whatsapp_${stage}`;
  const alreadySent: string[] = Array.isArray(booking.notifications_sent)
    ? (booking.notifications_sent as string[])
    : [];
  if (alreadySent.includes(sentKey)) {
    return { ok: true, skipped: true, reason: "already_sent" };
  }

  // Sum guests across all rooms in this booking
  const totalGuests =
    (booking.booking_rooms as unknown as Array<{ guests: number | null }>)
      ?.reduce((sum, br) => sum + (Number(br.guests) || 0), 0) ?? 0;

  // Build the payload. Fillracks WhatsApp config maps each template `type`
  // to a Meta template name and exposes named variables that match what
  // each template body uses. All 5 booking-lifecycle templates share the
  // same variable schema for simplicity:
  //   customer_name, booking_id, checkin_date, checkout_date, guest_count
  const payload = {
    to: formatPhone(booking.phone),
    type: template,
    customer_name: booking.guest_name,
    booking_id: booking.booking_code,
    checkin_date: formatDate(booking.check_in),
    checkout_date: formatDate(booking.check_out),
    guest_count: String(Math.max(1, totalGuests)),
  };

  let resp: Response;
  try {
    resp = await fetch(FILLRACKS_ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": FILLRACKS_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return {
      ok: false,
      error: `Fillracks network error: ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
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
    return {
      ok: false,
      error: `Fillracks HTTP ${resp.status}: ${detail.slice(0, 300)}`,
    };
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

  // Mark stage as sent. Failure to update is logged but doesn't bubble up —
  // the message was already accepted by Fillracks.
  const nextSent = [...alreadySent, sentKey];
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
      `[whatsapp] Sent ${stage} booking=${bookingId} jobId=${jobId}`
    );
  }

  return { ok: true };
}
