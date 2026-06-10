/**
 * Sends booking lifecycle emails to guests via Brevo (formerly Sendinblue).
 *
 * Called from:
 *   - app/api/send-booking-email/route.ts (HTTP entry — used by customer site)
 *   - app/(dashboard)/bookings/[id]/actions.ts (server actions on status change)
 *
 * Why Brevo instead of Resend: Wix DNS doesn't allow MX records on subdomains,
 * which Resend's verification requires. Brevo verifies via TXT records only
 * (SPF + DKIM), which Wix supports.
 *
 * Idempotency:
 *   Each booking has a `notifications_sent` jsonb array. Before sending we
 *   check whether this stage already shipped; if so we return success without
 *   re-sending. After a successful send we append the stage. Pass force=true
 *   to bypass this check for manual resends from the admin UI.
 *
 * Visibility:
 *   Every terminal outcome (sent/failed/skipped) is also written to
 *   bookings.notification_log via logNotificationAttempt so the admin UI
 *   can show per-stage delivery status with timestamps and retry buttons.
 */

import { createClient } from "@supabase/supabase-js";
import {
  renderEmail,
  type EmailStage,
  type BookingForEmail,
} from "./email-templates";
import { logNotificationAttempt } from "./notification-log";

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const FROM_ADDRESS =
  process.env.EMAIL_FROM_ADDRESS || "bookings@rathiatithibhawan.org";
const FROM_NAME = "Rathi Atithi Bhawan";
const REPLY_TO = process.env.EMAIL_REPLY_TO || "rathibhawan24@gmail.com";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export type SendResult =
  | { ok: true; skipped?: boolean; reason?: string }
  | { ok: false; error: string };

export async function sendBookingEmail(
  bookingId: string,
  stage: EmailStage,
  options?: { force?: boolean }
): Promise<SendResult> {
  const force = options?.force === true;

  if (!BREVO_API_KEY) {
    await logNotificationAttempt(bookingId, "email", stage, {
      status: "skipped",
      attempts: 0,
      reason: "no_api_key",
    });
    return {
      ok: false,
      error: "BREVO_API_KEY not configured — emails are disabled.",
    };
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return {
      ok: false,
      error: "Supabase service role not configured.",
    };
  }

  // Service-role client so we can read across RLS. The customer site triggers
  // the 'received' email anonymously, so this side needs to read the booking
  // on its behalf.
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: booking, error: fetchErr } = await supabase
    .from("bookings")
    .select(
      `
      id, booking_code, guest_name, email, phone,
      check_in, check_out, nights,
      total_amount, paid_amount, balance,
      rooms_subtotal, addons_subtotal,
      discount_type, discount_value, discount_amount,
      notifications_sent,
      booking_rooms (
        rate_per_night, guests,
        rooms ( room_number, room_type )
      )
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

  if (!booking.email) {
    await logNotificationAttempt(bookingId, "email", stage, {
      status: "skipped",
      attempts: 0,
      reason: "no_email_on_booking",
    });
    return { ok: true, skipped: true, reason: "no_email_on_booking" };
  }

  const alreadySent: string[] = Array.isArray(booking.notifications_sent)
    ? (booking.notifications_sent as string[])
    : [];
  if (!force && alreadySent.includes(stage)) {
    return { ok: true, skipped: true, reason: "already_sent" };
  }

  // Build the shape the email template expects, including discount fields
  // so the totals block renders Subtotal → Discount → Total correctly
  // when a discount is applied.
  const rooms = (
    booking.booking_rooms as unknown as Array<{
      rate_per_night: number | string;
      guests: number;
      rooms: { room_number: string; room_type: string } | null;
    }>
  ).flatMap((br) =>
    br.rooms
      ? [{ room_number: br.rooms.room_number, room_type: br.rooms.room_type }]
      : []
  );

  const forEmail: BookingForEmail = {
    booking_code: booking.booking_code,
    guest_name: booking.guest_name,
    email: booking.email,
    phone: booking.phone,
    check_in: booking.check_in,
    check_out: booking.check_out,
    nights: booking.nights,
    total_amount: Number(booking.total_amount),
    paid_amount: Number(booking.paid_amount),
    balance: Number(booking.balance),
    discount_type: (booking.discount_type ?? "none") as
      | "none"
      | "percent"
      | "amount",
    discount_value: Number(booking.discount_value ?? 0),
    discount_amount: Number(booking.discount_amount ?? 0),
    gross_subtotal:
      Number(booking.rooms_subtotal ?? 0) +
      Number(booking.addons_subtotal ?? 0),
    rooms,
  };

  const { subject, html } = renderEmail(stage, forEmail);

  let resp: Response;
  try {
    resp = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: FROM_ADDRESS, name: FROM_NAME },
        to: [{ email: booking.email, name: booking.guest_name }],
        replyTo: { email: REPLY_TO },
        subject,
        htmlContent: html,
      }),
    });
  } catch (e) {
    const error = `Brevo network error: ${
      e instanceof Error ? e.message : String(e)
    }`;
    await logNotificationAttempt(bookingId, "email", stage, {
      status: "failed",
      attempts: 1,
      error,
    });
    return { ok: false, error };
  }

  if (!resp.ok) {
    let detail = "";
    try {
      detail = await resp.text();
    } catch {
      // ignore
    }
    const error = `Brevo HTTP ${resp.status}: ${detail.slice(0, 300)}`;
    await logNotificationAttempt(bookingId, "email", stage, {
      status: "failed",
      attempts: 1,
      error,
    });
    return { ok: false, error };
  }

  // Parse messageId for logging — useful when debugging "did this email
  // actually deliver" with Brevo support.
  let messageId: string | undefined;
  try {
    const json = await resp.json();
    if (json && typeof json === "object" && "messageId" in json) {
      messageId = String((json as { messageId: unknown }).messageId);
    }
  } catch {
    // ignore — response might be plain text
  }

  // Append stage to notifications_sent (deduped). Failure to update is logged
  // but doesn't bubble up — the email was already sent via Brevo.
  const nextSent = Array.from(new Set([...alreadySent, stage]));
  const { error: updateErr } = await supabase
    .from("bookings")
    .update({ notifications_sent: nextSent })
    .eq("id", bookingId);

  if (updateErr) {
    console.warn(
      `[email] Sent stage=${stage} booking=${bookingId} but failed to update notifications_sent: ${updateErr.message}`
    );
  } else {
    console.log(
      `[email] Sent stage=${stage} booking=${bookingId} messageId=${messageId}`
    );
  }

  // Write detailed status to notification_log for admin visibility
  await logNotificationAttempt(bookingId, "email", stage, {
    status: "sent",
    attempts: 1,
    messageId,
  });

  return { ok: true };
}
