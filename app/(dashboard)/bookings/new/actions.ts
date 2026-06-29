"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { sendBookingEmail } from "@/lib/send-booking-email";
import { sendBookingWhatsapp } from "@/lib/send-booking-whatsapp";

const RoomSelectionSchema = z.object({
  room_id: z.string().uuid(),
  guests: z.number().int().min(1),
});

const AddonSelectionSchema = z.object({
  room_id: z.string().uuid(),
  addon_id: z.string().uuid(),
  quantity: z.number().int().min(1),
});

const PaymentSchema = z.object({
  amount: z.number().positive(),
  mode: z.enum(["upi", "cash", "bank"]),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

const WalkInBookingSchema = z.object({
  guest_name: z.string().min(1, "Guest name is required").max(100),
  phone: z.string().min(7, "Valid phone number required"),
  email: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ?? "").trim())
    .refine(
      (v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "Email is invalid"
    ),
  address: z.string().optional(),
  check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid check-in date"),
  check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid check-out date"),
  special_requests: z.string().optional(),
  rooms: z.array(RoomSelectionSchema).min(1, "At least one room is required"),
  addons: z.array(AddonSelectionSchema),
  initial_payment: PaymentSchema.nullable(),
});

export type WalkInBookingInput = z.infer<typeof WalkInBookingSchema>;

type ActionResult =
  | { success: true; booking_code: string; booking_id: string }
  | { success: false; error: string };

export async function createWalkInBooking(
  input: WalkInBookingInput
): Promise<ActionResult> {
  const parsed = WalkInBookingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? "Invalid input",
    };
  }

  // Cross-field check on dates
  if (parsed.data.check_out <= parsed.data.check_in) {
    return { success: false, error: "Check-out must be after check-in" };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("create_walk_in_booking", {
    p_guest_name: parsed.data.guest_name,
    p_phone: parsed.data.phone,
    p_email: parsed.data.email || null,
    p_address: parsed.data.address ?? null,
    p_check_in: parsed.data.check_in,
    p_check_out: parsed.data.check_out,
    p_special_requests: parsed.data.special_requests ?? null,
    p_rooms: parsed.data.rooms,
    p_addons: parsed.data.addons,
    p_initial_payment: parsed.data.initial_payment,
  });

  if (error) {
    console.error("Walk-in booking failed:", error);
    return { success: false, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.booking_id || !row?.booking_code) {
    return { success: false, error: "Booking created but no ID returned" };
  }

  revalidatePath("/bookings");
  revalidatePath("/");

  // Fire confirmed-stage email + WhatsApp. Walk-ins skip `pending` entirely
  // and are created with status `confirmed`, so the guest gets one clean
  // notification confirming their booking with all details (booking code,
  // dates, guests). Failures are logged but don't fail the request — the
  // booking row is already created and visible to staff.
  try {
    const r = await sendBookingEmail(row.booking_id, "confirmed");
    if (!r.ok) {
      console.warn(`[walk-in] email send failed: ${r.error}`);
    }
  } catch (e) {
    console.warn(`[walk-in] email send threw:`, e);
  }
  try {
    const w = await sendBookingWhatsapp(row.booking_id, "confirmed");
    if (!w.ok) {
      console.warn(`[walk-in] whatsapp send failed: ${w.error}`);
    }
  } catch (e) {
    console.warn(`[walk-in] whatsapp send threw:`, e);
  }

  return {
    success: true,
    booking_id: row.booking_id,
    booking_code: row.booking_code,
  };
}

export type AvailableRoom = {
  id: string;
  room_number: string;
  name: string;
  room_type: string;
  base_price: number;
  base_occupancy: number;
  extra_capacity: number;
  max_occupancy: number;
  // Override-aware pricing for the searched window (festival/seasonal rates).
  // Falls back to base_price * nights when no override applies.
  stay_total?: number;
  effective_nightly?: number;
  is_uniform?: boolean;
  override_applied?: boolean;
  override_name?: string | null;
};

type EffectiveRoomPrice = {
  room_id: string;
  stay_total: number | string;
  effective_nightly: number | string;
  is_uniform: boolean;
  override_applied: boolean;
  override_name: string | null;
};

export async function getAvailableRooms(
  checkIn: string,
  checkOut: string
): Promise<{ rooms: AvailableRoom[]; error: string | null }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    return { rooms: [], error: "Invalid dates" };
  }
  if (checkOut <= checkIn) {
    return { rooms: [], error: "Check-out must be after check-in" };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_available_rooms", {
    p_check_in: checkIn,
    p_check_out: checkOut,
  });

  if (error) {
    console.error("get_available_rooms failed:", error);
    return { rooms: [], error: error.message };
  }

  const baseRooms: AvailableRoom[] = (data ?? []).map((r: AvailableRoom) => ({
    id: r.id,
    room_number: r.room_number,
    name: r.name,
    room_type: r.room_type,
    base_price: Number(r.base_price),
    base_occupancy: r.base_occupancy,
    extra_capacity: r.extra_capacity,
    max_occupancy: r.max_occupancy,
  }));

  // Merge override-aware pricing for the same window. One extra query;
  // failures fall back to base_price * nights at display time.
  if (baseRooms.length > 0) {
    const { data: prices, error: priceErr } = await supabase.rpc(
      "get_effective_room_prices",
      {
        p_room_ids: baseRooms.map((r) => r.id),
        p_check_in: checkIn,
        p_check_out: checkOut,
      }
    );
    if (priceErr) {
      console.error("get_effective_room_prices failed:", priceErr);
    } else if (prices) {
      const byId = new Map(
        (prices as EffectiveRoomPrice[]).map((p) => [p.room_id, p])
      );
      for (const room of baseRooms) {
        const p = byId.get(room.id);
        if (!p) continue;
        room.stay_total = Number(p.stay_total);
        room.effective_nightly = Number(p.effective_nightly);
        room.is_uniform = p.is_uniform;
        room.override_applied = p.override_applied;
        room.override_name = p.override_name;
      }
    }
  }

  return { rooms: baseRooms, error: null };
}
