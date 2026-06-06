import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  Calendar,
  User,
  Phone,
  Mail,
  MapPin,
  BedDouble,
  Sparkles,
  IndianRupee,
  FileText,
  StickyNote,
  AlertCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { BookingActionsBar } from "./booking-actions-bar";
import { PaymentLedger } from "./payment-ledger";
import { GuestEditButton } from "./guest-edit-form";
import { StayEditButton } from "./stay-edit-form";
import { IdProofSection } from "./id-proof-section";
import { InternalNotesEditor } from "./internal-notes";
import type { BookingStatus, PaymentMode } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No-show",
  expired: "Expired",
};

const STATUS_VARIANT: Record<
  BookingStatus,
  "default" | "success" | "warning" | "destructive" | "muted" | "secondary"
> = {
  pending: "warning",
  confirmed: "default",
  checked_in: "success",
  checked_out: "muted",
  cancelled: "destructive",
  no_show: "destructive",
  expired: "muted",
};

type BookingRow = {
  id: string;
  booking_code: string;
  guest_name: string;
  phone: string;
  email: string;
  address: string | null;
  id_proof_type: string | null;
  id_proof_number: string | null;
  id_proof_url: string | null;
  id_proof_urls: string[] | null;
  check_in: string;
  check_out: string;
  nights: number;
  rooms_subtotal: number | string;
  addons_subtotal: number | string;
  total_amount: number | string;
  paid_amount: number | string;
  balance: number | string;
  status: BookingStatus;
  source: string;
  special_requests: string | null;
  internal_notes: string | null;
  cancellation_reason: string | null;
  created_at: string;
  confirmed_at: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  cancelled_at: string | null;
  booking_rooms: Array<{
    id: string;
    rate_per_night: number | string;
    nights: number;
    guests: number;
    subtotal: number | string;
    room: { room_number: string; name: string; room_type: string; max_occupancy: number };
    booking_room_addons: Array<{
      id: string;
      quantity: number;
      unit_price: number | string;
      total_charge: number | string;
      addon: { name: string; is_per_night: boolean };
    }>;
  }>;
  payments: Array<{
    id: string;
    amount: number | string;
    mode: PaymentMode;
    reference_number: string | null;
    notes: string | null;
    paid_at: string;
    created_at: string;
  }>;
};

export default async function BookingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  // Get current user role for admin-only actions
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()
    : { data: null };
  const isAdmin = profile?.role === "admin";

  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      *,
      booking_rooms (
        id, rate_per_night, nights, guests, subtotal,
        room:rooms ( room_number, name, room_type, max_occupancy ),
        booking_room_addons (
          id, quantity, unit_price, total_charge,
          addon:addons ( name, is_per_night )
        )
      ),
      payments ( id, amount, mode, reference_number, notes, paid_at, created_at )
    `
    )
    .eq("id", params.id)
    .single();

  if (error || !data) {
    notFound();
  }

  const booking = data as unknown as BookingRow;

  // Sort payments by paid_at desc
  booking.payments = (booking.payments ?? []).sort(
    (a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime()
  );

  const total = Number(booking.total_amount);
  const paid = Number(booking.paid_amount);
  const balance = Number(booking.balance);
  const roomsSubtotal = Number(booking.rooms_subtotal);
  const addonsSubtotal = Number(booking.addons_subtotal);

  const canRecordPayments = !["cancelled", "expired", "no_show"].includes(
    booking.status
  );

  // Format payments to match the Payment type the ledger expects
  const ledgerPayments = booking.payments.map((p) => ({
    id: p.id,
    booking_id: booking.id,
    amount: Number(p.amount),
    mode: p.mode,
    reference_number: p.reference_number,
    notes: p.notes,
    recorded_by: null,
    paid_at: p.paid_at,
    created_at: p.created_at,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/bookings"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ChevronLeft className="h-4 w-4" />
          All bookings
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-display text-3xl tracking-tight">
                {booking.guest_name}
              </h1>
              <Badge variant={STATUS_VARIANT[booking.status]}>
                {STATUS_LABELS[booking.status]}
              </Badge>
              {booking.source === "walk_in" && (
                <Badge variant="outline">Walk-in</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1 font-mono">
              {booking.booking_code} · created {formatDateTime(booking.created_at)}
            </p>
          </div>
          <BookingActionsBar
            bookingId={booking.id}
            status={booking.status}
            hasIdProof={!!(booking.id_proof_type && booking.id_proof_number)}
            balance={balance}
          />
        </div>
        {booking.status === "cancelled" && booking.cancellation_reason && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-destructive">Cancelled</p>
              <p className="text-muted-foreground">
                {booking.cancellation_reason}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stay */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  Stay
                </CardTitle>
                <StayEditButton
                  bookingId={booking.id}
                  initial={{
                    check_in: booking.check_in,
                    check_out: booking.check_out,
                    special_requests: booking.special_requests ?? null,
                    status: booking.status,
                  }}
                  rooms={booking.booking_rooms.map((br) => ({
                    booking_room_id: br.id,
                    room_number: br.room?.room_number ?? "",
                    room_label: br.room?.room_type ?? "",
                    current_guests: br.guests,
                    max_occupancy: br.room?.max_occupancy ?? br.guests,
                  }))}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Check-in
                  </p>
                  <p className="font-medium mt-0.5">
                    {formatDate(booking.check_in)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Check-out
                  </p>
                  <p className="font-medium mt-0.5">
                    {formatDate(booking.check_out)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Nights
                  </p>
                  <p className="font-medium mt-0.5 tabular-nums">
                    {booking.nights}
                  </p>
                </div>
              </div>
              {booking.special_requests && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                    Special requests
                  </p>
                  <p className="text-sm whitespace-pre-wrap">
                    {booking.special_requests}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rooms */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BedDouble className="h-4 w-4 text-primary" />
                Rooms ({booking.booking_rooms.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {booking.booking_rooms.map((br) => (
                <div key={br.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">
                        #{br.room.room_number} · {br.room.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {br.room.room_type} · {br.guests} guest
                        {br.guests === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="text-right text-sm tabular-nums">
                      <p className="font-medium">
                        {formatCurrency(Number(br.subtotal))}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(Number(br.rate_per_night))} × {br.nights}
                      </p>
                    </div>
                  </div>
                  {br.booking_room_addons.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/60 space-y-1">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        Add-ons
                      </p>
                      {br.booking_room_addons.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="text-muted-foreground">
                            {a.addon.name}
                            {a.quantity > 1 && ` × ${a.quantity}`}
                          </span>
                          <span className="tabular-nums">
                            {formatCurrency(Number(a.total_charge))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t border-border">
                <span>Rooms subtotal</span>
                <span className="tabular-nums">
                  {formatCurrency(roomsSubtotal)}
                </span>
              </div>
              {addonsSubtotal > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Add-ons subtotal</span>
                  <span className="tabular-nums">
                    {formatCurrency(addonsSubtotal)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <IndianRupee className="h-4 w-4 text-primary" />
                Payment ledger
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PaymentLedger
                bookingId={booking.id}
                payments={ledgerPayments}
                total={total}
                paid={paid}
                balance={balance}
                isAdmin={isAdmin}
                canRecordPayments={canRecordPayments}
              />
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          {/* Guest */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                Guest
              </CardTitle>
              <GuestEditButton
                bookingId={booking.id}
                initial={{
                  guest_name: booking.guest_name,
                  phone: booking.phone,
                  email: booking.email,
                  address: booking.address,
                }}
              />
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <a
                  href={`tel:${booking.phone}`}
                  className="hover:text-primary transition-colors"
                >
                  {booking.phone}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <a
                  href={`mailto:${booking.email}`}
                  className="hover:text-primary transition-colors truncate"
                >
                  {booking.email}
                </a>
              </div>
              {booking.address && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">
                    {booking.address}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ID proof */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                ID proof
              </CardTitle>
            </CardHeader>
            <CardContent>
              <IdProofSection
                bookingId={booking.id}
                initial={{
                  type: booking.id_proof_type,
                  number: booking.id_proof_number,
                  urls:
                    booking.id_proof_urls && booking.id_proof_urls.length > 0
                      ? booking.id_proof_urls
                      : booking.id_proof_url
                      ? [booking.id_proof_url]
                      : [],
                }}
              />
            </CardContent>
          </Card>

          {/* Internal notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-primary" />
                Internal notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <InternalNotesEditor
                bookingId={booking.id}
                initial={booking.internal_notes}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
