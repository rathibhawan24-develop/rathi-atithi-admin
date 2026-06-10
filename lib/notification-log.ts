/**
 * Writes per-stage, per-channel delivery records to bookings.notification_log.
 *
 * This is a sibling to notifications_sent (which is the idempotency-only
 * string array) — notification_log is the rich record the admin UI reads
 * to display delivery status, errors, and resend buttons.
 *
 * Each call upserts ONE entry keyed by "{stage}_{channel}".
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type NotificationStatus = "sent" | "failed" | "skipped";
export type NotificationChannel = "email" | "whatsapp";

export type NotificationLogEntry = {
  status: NotificationStatus;
  at: string;           // ISO timestamp
  attempts: number;     // attempts in the last send operation (not lifetime)
  error?: string;       // present when status=failed
  reason?: string;      // present when status=skipped (e.g. "no_phone")
  messageId?: string;   // Brevo message ID, when known
  jobId?: string;       // Fillracks job ID, when known
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let cachedClient: SupabaseClient | null = null;
function getServiceRoleClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  if (!cachedClient) {
    cachedClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedClient;
}

/**
 * Write (upsert) a single delivery record to the notification_log column.
 * Failures here are logged but never thrown — logging is best-effort and
 * must never crash the calling send flow.
 */
export async function logNotificationAttempt(
  bookingId: string,
  channel: NotificationChannel,
  stage: string,
  entry: Omit<NotificationLogEntry, "at">
): Promise<void> {
  const supabase = getServiceRoleClient();
  if (!supabase) return;

  const key = `${stage}_${channel}`;
  const fullEntry: NotificationLogEntry = {
    ...entry,
    at: new Date().toISOString(),
  };

  try {
    const { data } = await supabase
      .from("bookings")
      .select("notification_log")
      .eq("id", bookingId)
      .single();

    const current = (data?.notification_log ?? {}) as Record<
      string,
      NotificationLogEntry
    >;
    const next = { ...current, [key]: fullEntry };

    const { error } = await supabase
      .from("bookings")
      .update({ notification_log: next })
      .eq("id", bookingId);

    if (error) {
      console.warn(
        `[notification-log] write failed for booking=${bookingId} key=${key}: ${error.message}`
      );
    }
  } catch (e) {
    console.warn(
      `[notification-log] write threw for booking=${bookingId} key=${key}:`,
      e
    );
  }
}
