// Database types matching the Supabase schema.
// In a later phase we'll auto-generate these via `supabase gen types typescript`.

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "staff";
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Room = {
  id: string;
  room_number: string;
  name: string;
  room_type: string;
  description: string | null;
  base_price: number;
  weekend_price: number | null;
  base_occupancy: number;
  extra_capacity: number;
  max_occupancy: number;
  amenities: string[];
  photos: string[];
  display_order: number;
  is_active: boolean;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Addon = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_per_night: boolean;
  max_per_room: number;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "checked_in"
  | "checked_out"
  | "cancelled"
  | "no_show"
  | "expired";

export type BookingSource = "web" | "walk_in" | "phone" | "whatsapp";

export type Booking = {
  id: string;
  booking_code: string;
  guest_name: string;
  phone: string;
  email: string;
  address: string | null;
  id_proof_type: string | null;
  id_proof_number: string | null;
  id_proof_url: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  rooms_subtotal: number;
  addons_subtotal: number;
  total_amount: number;
  paid_amount: number;
  balance: number;
  status: BookingStatus;
  source: BookingSource;
  group_id: string | null;
  special_requests: string | null;
  internal_notes: string | null;
  cancellation_reason: string | null;
  created_by: string | null;
  created_at: string;
  confirmed_at: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  cancelled_at: string | null;
  expires_at: string | null;
  updated_at: string;
};

export type PaymentMode = "upi" | "cash" | "bank";

export type Payment = {
  id: string;
  booking_id: string;
  amount: number;
  mode: PaymentMode;
  reference_number: string | null;
  notes: string | null;
  recorded_by: string | null;
  paid_at: string;
  created_at: string;
};
