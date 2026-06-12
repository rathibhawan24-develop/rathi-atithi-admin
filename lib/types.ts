// Database types matching the Supabase schema.
// In a later phase we'll auto-generate these via `supabase gen types typescript`.

// ----- Roles & permissions -------------------------------------------------

export type UserRole = "admin" | "manager" | "reception" | "viewer";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Owner",
  manager: "Manager",
  reception: "Reception",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: "Full access including users, settings, and deleting bookings",
  manager: "Operations — bookings, rooms, gallery, pricing, reports",
  reception: "Bookings, calendar, and guests only",
  viewer: "Read-only access to data",
};

// Permission helpers — call from server components, server actions, and the
// sidebar. Keep these in one place so role logic doesn't drift.

/** Can manage user accounts (add, remove, change roles). Admin only. */
export function canManageUsers(role: UserRole | null): boolean {
  return role === "admin";
}

/** Can change hotel-wide settings (contact info, business rules). Admin only. */
export function canManageSettings(role: UserRole | null): boolean {
  return role === "admin";
}

/** Can edit rooms, photos, gallery, add-ons, pricing. Admin + Manager. */
export function canManageContent(role: UserRole | null): boolean {
  return role === "admin" || role === "manager";
}

/** Can create/edit bookings + payments. Admin + Manager + Reception. */
export function canManageBookings(role: UserRole | null): boolean {
  return role === "admin" || role === "manager" || role === "reception";
}

/** Can permanently delete a booking. Admin only — destructive action. */
export function canDeleteBookings(role: UserRole | null): boolean {
  return role === "admin";
}

/** Can see Reports page. Admin + Manager + Viewer (Reception doesn't need.) */
export function canViewReports(role: UserRole | null): boolean {
  return role === "admin" || role === "manager" || role === "viewer";
}

/** Read-only — used to disable any action button. */
export function isReadOnly(role: UserRole | null): boolean {
  return role === "viewer";
}

// ----- Database row types --------------------------------------------------

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
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

  booking_rooms?: { rooms: { room_number: string } | null }[] | null;
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
