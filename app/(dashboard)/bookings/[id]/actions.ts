"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { sendBookingEmail } from "@/lib/send-booking-email";
import { sendBookingWhatsapp } from "@/lib/send-booking-whatsapp";
import type { EmailStage } from "@/lib/email-templates";
import type { BookingStatus } from "@/lib/types";

type ActionResult = { success: true } | { success: false; error: string };

async function requireAuth() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, error: "Not authenticated" };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();
  if (!profile || !profile.is_active) {
    return { supabase, user: null, error: "Inactive account" };
  }
  return { supabase, user, role: profile.role as "admin" | "staff", error: null };
}

// =============================================================================
// Status transitions
// =============================================================================

const StatusTransitions: Record<BookingStatus, BookingStatus[]> = {
  pending: ["confirmed", "cancelled", "no_show"],
  confirmed: ["checked_in", "cancelled", "no_show"],
  checked_in: ["checked_out", "cancelled"],
  checked_out: [],
  cancelled: [],
  no_show: [],
  expired: [],
};

export async function updateBookingStatus(
  bookingId: string,
  newStatus: BookingStatus,
  reason?: string
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.user || !auth.supabase)
    return { success: false, error: auth.error ?? "Auth required" };

  const { data: booking, error: fetchErr } = await auth.supabase
    .from("bookings")
    .select("status")
    .eq("id", bookingId)
    .single();
  if (fetchErr || !booking) {
    return { success: false, error: "Booking not found" };
  }

  const allowed = StatusTransitions[booking.status as BookingStatus] ?? [];
  if (!allowed.includes(newStatus)) {
    return {
      success: false,
      error: `Cannot transition from ${booking.status} to ${newStatus}`,
    };
  }

  const updates: Record<string, unknown> = { status: newStatus };
  const now = new Date().toISOString();
  if (newStatus === "confirmed") updates.confirmed_at = now;
  else if (newStatus === "checked_in") updates.checked_in_at = now;
  else if (newStatus === "checked_out") updates.checked_out_at = now;
  else if (newStatus === "cancelled") {
    updates.cancelled_at = now;
    if (reason) updates.cancellation_reason = reason;
  }

  const { error } = await auth.supabase
    .from("bookings")
    .update(updates)
    .eq("id", bookingId);
  if (error) return { success: false, error: error.message };

  // Fire transactional email for this lifecycle stage. We don't fail the
  // status change if the email fails — log it and proceed.
  const emailStage: EmailStage | null =
    newStatus === "confirmed"
      ? "confirmed"
      : newStatus === "checked_in"
        ? "checked_in"
        : newStatus === "checked_out"
          ? "checked_out"
          : newStatus === "cancelled"
            ? "cancelled"
            : null;
  if (emailStage) {
    try {
      const r = await sendBookingEmail(bookingId, emailStage);
      if (!r.ok) {
        console.warn(
          `[updateBookingStatus] email send failed: ${r.error}`
        );
      }
    } catch (e) {
      console.warn(`[updateBookingStatus] email send threw:`, e);
    }
    try {
      const w = await sendBookingWhatsapp(bookingId, emailStage);
      if (!w.ok) {
        console.warn(
          `[updateBookingStatus] whatsapp send failed: ${w.error}`
        );
      }
    } catch (e) {
      console.warn(`[updateBookingStatus] whatsapp send threw:`, e);
    }
  }

  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/bookings");
  revalidatePath("/");
  return { success: true };
}

// =============================================================================
// Payments
// =============================================================================

const PaymentInputSchema = z.object({
  booking_id: z.string().uuid(),
  amount: z.number().refine((n) => n !== 0, "Amount cannot be zero"),
  mode: z.enum(["upi", "cash", "bank"]),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
  paid_at: z.string().optional(),
});

export type PaymentInput = z.infer<typeof PaymentInputSchema>;

export async function addPayment(input: PaymentInput): Promise<ActionResult> {
  const parsed = PaymentInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? "Invalid input",
    };
  }

  const auth = await requireAuth();
  if (!auth.user || !auth.supabase)
    return { success: false, error: auth.error ?? "Auth required" };

  const { error } = await auth.supabase.from("payments").insert({
    booking_id: parsed.data.booking_id,
    amount: parsed.data.amount,
    mode: parsed.data.mode,
    reference_number: parsed.data.reference_number?.trim() || null,
    notes: parsed.data.notes?.trim() || null,
    recorded_by: auth.user.id,
    paid_at: parsed.data.paid_at ?? new Date().toISOString(),
  });

  if (error) return { success: false, error: error.message };

  revalidatePath(`/bookings/${parsed.data.booking_id}`);
  revalidatePath("/bookings");
  revalidatePath("/");
  return { success: true };
}

export async function deletePayment(
  paymentId: string,
  bookingId: string
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.user || !auth.supabase)
    return { success: false, error: auth.error ?? "Auth required" };
  if (auth.role !== "admin") {
    return { success: false, error: "Only admins can delete payments" };
  }

  const { error } = await auth.supabase
    .from("payments")
    .delete()
    .eq("id", paymentId);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/bookings");
  return { success: true };
}

// =============================================================================
// Guest info
// =============================================================================

const GuestInfoSchema = z.object({
  booking_id: z.string().uuid(),
  guest_name: z.string().min(1).max(100),
  phone: z.string().min(7),
  email: z.string().email(),
  address: z.string().nullable(),
});

export type GuestInfoInput = z.infer<typeof GuestInfoSchema>;

export async function updateGuestInfo(
  input: GuestInfoInput
): Promise<ActionResult> {
  const parsed = GuestInfoSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? "Invalid input",
    };
  }

  const auth = await requireAuth();
  if (!auth.user || !auth.supabase)
    return { success: false, error: auth.error ?? "Auth required" };

  const { booking_id, ...updates } = parsed.data;
  const { error } = await auth.supabase
    .from("bookings")
    .update({
      ...updates,
      address: updates.address?.trim() || null,
    })
    .eq("id", booking_id);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/bookings/${booking_id}`);
  return { success: true };
}

// =============================================================================
// ID proof
// =============================================================================

const IdProofSchema = z.object({
  booking_id: z.string().uuid(),
  id_proof_type: z.enum([
    "aadhaar",
    "passport",
    "driving_license",
    "voter_id",
    "other",
  ]),
  id_proof_number: z.string().min(1),
  id_proof_url: z.string().optional(),
  id_proof_urls: z.array(z.string()).max(5, "Maximum 5 ID proof files").optional(),
});

export type IdProofInput = z.infer<typeof IdProofSchema>;

export async function updateIdProof(
  input: IdProofInput
): Promise<ActionResult> {
  const parsed = IdProofSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? "Invalid input",
    };
  }

  const auth = await requireAuth();
  if (!auth.user || !auth.supabase)
    return { success: false, error: auth.error ?? "Auth required" };

  const { booking_id, ...rest } = parsed.data;
  // Keep the legacy id_proof_url column in sync with the first item of the
  // array, so any external consumers that still read the single column
  // continue to see *a* file.
  const updates: Record<string, unknown> = { ...rest };
  if (Array.isArray(rest.id_proof_urls)) {
    updates.id_proof_urls = rest.id_proof_urls;
    updates.id_proof_url = rest.id_proof_urls[0] ?? null;
  }
  const { error } = await auth.supabase
    .from("bookings")
    .update(updates)
    .eq("id", booking_id);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/bookings/${booking_id}`);
  return { success: true };
}

// =============================================================================
// Internal notes
// =============================================================================

export async function updateInternalNotes(
  bookingId: string,
  notes: string
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.user || !auth.supabase)
    return { success: false, error: auth.error ?? "Auth required" };

  const { error } = await auth.supabase
    .from("bookings")
    .update({ internal_notes: notes.trim() || null })
    .eq("id", bookingId);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/bookings/${bookingId}`);
  return { success: true };
}

// =============================================================================
// Signed URL helper for ID proof viewing
// =============================================================================

export async function getIdProofSignedUrl(
  path: string
): Promise<{ url: string | null; error: string | null }> {
  const auth = await requireAuth();
  if (!auth.user || !auth.supabase) {
    return { url: null, error: auth.error ?? "Auth required" };
  }
  const { data, error } = await auth.supabase.storage
    .from("guest-id-proofs")
    .createSignedUrl(path, 3600); // 1 hour
  if (error) return { url: null, error: error.message };
  return { url: data?.signedUrl ?? null, error: null };
}


// =============================================================================
// Edit booking stay — dates, special requests, per-room guest counts
// =============================================================================

const RoomGuestsItem = z.object({
  booking_room_id: z.string().uuid(),
  guests: z.number().int().min(1),
});

const UpdateBookingStaySchema = z.object({
  booking_id: z.string().uuid(),
  check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid check-in date"),
  check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid check-out date"),
  special_requests: z.string().nullable().optional(),
  room_guests: z.array(RoomGuestsItem).default([]),
});

export type UpdateBookingStayInput = z.infer<typeof UpdateBookingStaySchema>;

export async function updateBookingStay(
  input: UpdateBookingStayInput
): Promise<ActionResult> {
  const parsed = UpdateBookingStaySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? "Invalid input",
    };
  }

  const auth = await requireAuth();
  if (!auth.user || !auth.supabase)
    return { success: false, error: auth.error ?? "Auth required" };

  if (parsed.data.check_out <= parsed.data.check_in) {
    return { success: false, error: "Check-out must be after check-in" };
  }

  const { error } = await auth.supabase.rpc("update_booking_stay", {
    p_booking_id: parsed.data.booking_id,
    p_check_in: parsed.data.check_in,
    p_check_out: parsed.data.check_out,
    p_special_requests: parsed.data.special_requests ?? null,
    p_room_guests: parsed.data.room_guests,
  });

  if (error) return { success: false, error: error.message };

  revalidatePath(`/bookings/${parsed.data.booking_id}`);
  revalidatePath(`/bookings`);
  return { success: true };
}


// =============================================================================
// Edit a single room inside a booking — guests + add-ons
// =============================================================================

const AddonItem = z.object({
  addon_id: z.string().uuid(),
  quantity: z.number().int().min(1),
});

const UpdateBookingRoomSchema = z.object({
  booking_id: z.string().uuid(),
  booking_room_id: z.string().uuid(),
  guests: z.number().int().min(1),
  addons: z.array(AddonItem).default([]),
});

export type UpdateBookingRoomInput = z.infer<typeof UpdateBookingRoomSchema>;

export async function updateBookingRoom(
  input: UpdateBookingRoomInput
): Promise<ActionResult> {
  const parsed = UpdateBookingRoomSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? "Invalid input",
    };
  }

  const auth = await requireAuth();
  if (!auth.user || !auth.supabase)
    return { success: false, error: auth.error ?? "Auth required" };

  const { error } = await auth.supabase.rpc("update_booking_room", {
    p_booking_id: parsed.data.booking_id,
    p_booking_room_id: parsed.data.booking_room_id,
    p_guests: parsed.data.guests,
    p_addons: parsed.data.addons,
  });

  if (error) return { success: false, error: error.message };

  revalidatePath(`/bookings/${parsed.data.booking_id}`);
  revalidatePath(`/bookings`);
  return { success: true };
}


// =============================================================================
// Override the nightly rate for one room (manual discount / comp)
// =============================================================================

const UpdateRoomRateSchema = z.object({
  booking_id: z.string().uuid(),
  booking_room_id: z.string().uuid(),
  rate_per_night: z.number().min(0),
});

export type UpdateRoomRateInput = z.infer<typeof UpdateRoomRateSchema>;

export async function updateBookingRoomRate(
  input: UpdateRoomRateInput
): Promise<ActionResult> {
  const parsed = UpdateRoomRateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? "Invalid input",
    };
  }
  const auth = await requireAuth();
  if (!auth.user || !auth.supabase)
    return { success: false, error: auth.error ?? "Auth required" };

  const { error } = await auth.supabase.rpc("update_booking_room_rate", {
    p_booking_id: parsed.data.booking_id,
    p_booking_room_id: parsed.data.booking_room_id,
    p_rate_per_night: parsed.data.rate_per_night,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath(`/bookings/${parsed.data.booking_id}`);
  return { success: true };
}

// =============================================================================
// Add a brand-new room to an existing booking
// =============================================================================

const AddRoomSchema = z.object({
  booking_id: z.string().uuid(),
  room_id: z.string().uuid(),
  guests: z.number().int().min(1),
  addons: z
    .array(
      z.object({
        addon_id: z.string().uuid(),
        quantity: z.number().int().min(1),
      })
    )
    .default([]),
});

export type AddRoomInput = z.infer<typeof AddRoomSchema>;

export async function addRoomToBooking(
  input: AddRoomInput
): Promise<ActionResult> {
  const parsed = AddRoomSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? "Invalid input",
    };
  }
  const auth = await requireAuth();
  if (!auth.user || !auth.supabase)
    return { success: false, error: auth.error ?? "Auth required" };

  const { error } = await auth.supabase.rpc("add_room_to_booking", {
    p_booking_id: parsed.data.booking_id,
    p_room_id: parsed.data.room_id,
    p_guests: parsed.data.guests,
    p_addons: parsed.data.addons,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath(`/bookings/${parsed.data.booking_id}`);
  revalidatePath(`/bookings`);
  return { success: true };
}

// =============================================================================
// Remove a room from a booking
// =============================================================================

const RemoveRoomSchema = z.object({
  booking_id: z.string().uuid(),
  booking_room_id: z.string().uuid(),
});

export type RemoveRoomInput = z.infer<typeof RemoveRoomSchema>;

export async function removeRoomFromBooking(
  input: RemoveRoomInput
): Promise<ActionResult> {
  const parsed = RemoveRoomSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? "Invalid input",
    };
  }
  const auth = await requireAuth();
  if (!auth.user || !auth.supabase)
    return { success: false, error: auth.error ?? "Auth required" };

  const { error } = await auth.supabase.rpc("remove_room_from_booking", {
    p_booking_id: parsed.data.booking_id,
    p_booking_room_id: parsed.data.booking_room_id,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath(`/bookings/${parsed.data.booking_id}`);
  revalidatePath(`/bookings`);
  return { success: true };
}

// =============================================================================
// Atomically swap one room for another
// =============================================================================

const SwapRoomSchema = z.object({
  booking_id: z.string().uuid(),
  old_booking_room_id: z.string().uuid(),
  new_room_id: z.string().uuid(),
});

export type SwapRoomInput = z.infer<typeof SwapRoomSchema>;

export async function swapBookingRoom(
  input: SwapRoomInput
): Promise<ActionResult> {
  const parsed = SwapRoomSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? "Invalid input",
    };
  }
  const auth = await requireAuth();
  if (!auth.user || !auth.supabase)
    return { success: false, error: auth.error ?? "Auth required" };

  const { error } = await auth.supabase.rpc("swap_booking_room", {
    p_booking_id: parsed.data.booking_id,
    p_old_booking_room_id: parsed.data.old_booking_room_id,
    p_new_room_id: parsed.data.new_room_id,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath(`/bookings/${parsed.data.booking_id}`);
  revalidatePath(`/bookings`);
  return { success: true };
}


// =============================================================================
// Apply or clear a discount on a booking
// =============================================================================

const SetDiscountSchema = z.object({
  booking_id: z.string().uuid(),
  discount_type: z.enum(["none", "percent", "amount"]),
  discount_value: z.number().min(0),
});

export type SetDiscountInput = z.infer<typeof SetDiscountSchema>;

export async function setBookingDiscount(
  input: SetDiscountInput
): Promise<ActionResult> {
  const parsed = SetDiscountSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? "Invalid input",
    };
  }
  const auth = await requireAuth();
  if (!auth.user || !auth.supabase)
    return { success: false, error: auth.error ?? "Auth required" };

  // Extra client-side validation matching the RPC
  if (
    parsed.data.discount_type === "percent" &&
    parsed.data.discount_value > 100
  ) {
    return { success: false, error: "Percentage cannot exceed 100" };
  }

  const { error } = await auth.supabase.rpc("set_booking_discount", {
    p_booking_id: parsed.data.booking_id,
    p_discount_type: parsed.data.discount_type,
    p_discount_value: parsed.data.discount_value,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath(`/bookings/${parsed.data.booking_id}`);
  revalidatePath(`/bookings`);
  return { success: true };
}

// =============================================================================
// Set or clear a free-form "other charges" line on a booking
// =============================================================================

const SetOtherChargesSchema = z.object({
  booking_id: z.string().uuid(),
  amount: z.number().min(0, "Amount cannot be negative"),
  note: z.string().max(200).optional().nullable(),
});

export type SetOtherChargesInput = z.infer<typeof SetOtherChargesSchema>;

export async function setBookingOtherCharges(
  input: SetOtherChargesInput
): Promise<ActionResult> {
  const parsed = SetOtherChargesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? "Invalid input",
    };
  }
  const auth = await requireAuth();
  if (!auth.user || !auth.supabase)
    return { success: false, error: auth.error ?? "Auth required" };

  const { error } = await auth.supabase.rpc("set_booking_other_charges", {
    p_booking_id: parsed.data.booking_id,
    p_amount: parsed.data.amount,
    p_note: parsed.data.note ?? null,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath(`/bookings/${parsed.data.booking_id}`);
  revalidatePath(`/bookings`);
  return { success: true };
}

// =============================================================================
// Manual resend of a notification (email or WhatsApp) for a given stage
// =============================================================================
const ResendNotificationSchema = z.object({
  booking_id: z.string().uuid(),
  stage: z.enum(["received", "confirmed", "checked_in", "checked_out", "cancelled"]),
  channel: z.enum(["email", "whatsapp"]),
});

export type ResendNotificationInput = z.infer<typeof ResendNotificationSchema>;

export async function resendNotification(
  input: ResendNotificationInput
): Promise<ActionResult> {
  const parsed = ResendNotificationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? "Invalid input",
    };
  }
  const auth = await requireAuth();
  if (!auth.user || !auth.supabase)
    return { success: false, error: auth.error ?? "Auth required" };

  const { booking_id, stage, channel } = parsed.data;

  try {
    if (channel === "email") {
      const r = await sendBookingEmail(booking_id, stage, { force: true });
      if (!r.ok) return { success: false, error: r.error };
      if ("skipped" in r && r.skipped)
        return { success: false, error: `Skipped: ${r.reason ?? "unknown"}` };
    } else {
      const r = await sendBookingWhatsapp(booking_id, stage, { force: true });
      if (!r.ok) return { success: false, error: r.error };
      if ("skipped" in r && r.skipped)
        return { success: false, error: `Skipped: ${r.reason ?? "unknown"}` };
    }
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Send threw",
    };
  }

  revalidatePath(`/bookings/${booking_id}`);
  return { success: true };
}
