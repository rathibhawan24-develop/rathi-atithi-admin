"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarCheck,
  User,
  IndianRupee,
  BedDouble,
  Loader2,
  Save,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, cn } from "@/lib/utils";
import {
  createWalkInBooking,
  getAvailableRooms,
  type AvailableRoom,
} from "./actions";
import type { Addon } from "@/lib/types";

type RoomSelection = {
  room_id: string;
  guests: number;
  addons: { addon_id: string; quantity: number }[];
};

const TYPE_ORDER = ["Supreme", "4 Bed", "Deluxe", "Sudama 6 Bed"];

function todayISO(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function tomorrowISO(): string {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function calcNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut || checkOut <= checkIn) return 0;
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function WalkInForm({ addons }: { addons: Addon[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Guest info
  const [guestName, setGuestName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  // Dates
  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState(tomorrowISO());

  // Available rooms (fetched after dates change)
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [roomFetchError, setRoomFetchError] = useState<string | null>(null);

  // Selected rooms (keyed by room_id for quick lookup)
  const [selections, setSelections] = useState<Record<string, RoomSelection>>(
    {}
  );

  // Special requests
  const [specialRequests, setSpecialRequests] = useState("");

  // Initial payment (optional)
  const [enablePayment, setEnablePayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<"upi" | "cash" | "bank">(
    "cash"
  );
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const nights = calcNights(checkIn, checkOut);

  // Fetch available rooms whenever dates change
  useEffect(() => {
    if (!checkIn || !checkOut || checkOut <= checkIn) {
      setAvailableRooms([]);
      return;
    }
    let cancelled = false;
    setLoadingRooms(true);
    setRoomFetchError(null);
    getAvailableRooms(checkIn, checkOut).then((res) => {
      if (cancelled) return;
      setLoadingRooms(false);
      if (res.error) {
        setRoomFetchError(res.error);
        setAvailableRooms([]);
        return;
      }
      setAvailableRooms(res.rooms);
      // Drop any selections for rooms that are no longer available
      setSelections((prev) => {
        const next: Record<string, RoomSelection> = {};
        for (const r of res.rooms) {
          if (prev[r.id]) next[r.id] = prev[r.id];
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [checkIn, checkOut]);

  // Group available rooms by type for display
  const grouped: Record<string, AvailableRoom[]> = {};
  for (const r of availableRooms) {
    if (!grouped[r.room_type]) grouped[r.room_type] = [];
    grouped[r.room_type].push(r);
  }
  const orderedTypes = [
    ...TYPE_ORDER.filter((t) => grouped[t]),
    ...Object.keys(grouped)
      .filter((t) => !TYPE_ORDER.includes(t))
      .sort(),
  ];

  // Totals
  const roomsSubtotal = Object.values(selections).reduce((sum, sel) => {
    const room = availableRooms.find((r) => r.id === sel.room_id);
    return sum + (room ? room.base_price * nights : 0);
  }, 0);

  const addonsSubtotal = Object.values(selections).reduce((sum, sel) => {
    return (
      sum +
      sel.addons.reduce((s2, a) => {
        const ad = addons.find((x) => x.id === a.addon_id);
        if (!ad) return s2;
        const mul = ad.is_per_night ? nights : 1;
        return s2 + ad.price * a.quantity * mul;
      }, 0)
    );
  }, 0);

  const total = roomsSubtotal + addonsSubtotal;

  const toggleRoom = (room: AvailableRoom) => {
    setSelections((prev) => {
      const next = { ...prev };
      if (next[room.id]) {
        delete next[room.id];
      } else {
        next[room.id] = {
          room_id: room.id,
          guests: room.base_occupancy,
          addons: [],
        };
      }
      return next;
    });
  };

  const updateRoomGuests = (roomId: string, guests: number) => {
    setSelections((prev) => ({
      ...prev,
      [roomId]: { ...prev[roomId], guests },
    }));
  };

  const toggleAddon = (roomId: string, addon: Addon) => {
    setSelections((prev) => {
      const sel = prev[roomId];
      if (!sel) return prev;
      const existing = sel.addons.find((a) => a.addon_id === addon.id);
      const nextAddons = existing
        ? sel.addons.filter((a) => a.addon_id !== addon.id)
        : [...sel.addons, { addon_id: addon.id, quantity: 1 }];
      return { ...prev, [roomId]: { ...sel, addons: nextAddons } };
    });
  };

  const updateAddonQuantity = (
    roomId: string,
    addonId: string,
    quantity: number
  ) => {
    setSelections((prev) => {
      const sel = prev[roomId];
      if (!sel) return prev;
      return {
        ...prev,
        [roomId]: {
          ...sel,
          addons: sel.addons.map((a) =>
            a.addon_id === addonId ? { ...a, quantity } : a
          ),
        },
      };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(selections).length === 0) {
      toast.error("Please select at least one room.");
      return;
    }
    if (enablePayment && paymentAmount <= 0) {
      toast.error("Enter a payment amount or disable the payment section.");
      return;
    }

    const rooms = Object.values(selections).map((s) => ({
      room_id: s.room_id,
      guests: s.guests,
    }));
    const addonsFlat = Object.values(selections).flatMap((s) =>
      s.addons.map((a) => ({
        room_id: s.room_id,
        addon_id: a.addon_id,
        quantity: a.quantity,
      }))
    );

    const initial_payment = enablePayment
      ? {
          amount: paymentAmount,
          mode: paymentMode,
          reference: paymentRef.trim() || undefined,
          notes: paymentNotes.trim() || undefined,
        }
      : null;

    startTransition(async () => {
      const result = await createWalkInBooking({
        guest_name: guestName,
        phone,
        email,
        address: address.trim() || undefined,
        check_in: checkIn,
        check_out: checkOut,
        special_requests: specialRequests.trim() || undefined,
        rooms,
        addons: addonsFlat,
        initial_payment,
      });

      if (result.success) {
        toast.success(`Booking ${result.booking_code} confirmed.`);
        router.push("/bookings");
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Guest information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Guest information
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="guest_name">Full name *</Label>
            <Input
              id="guest_name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="As per ID proof"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone *</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email (optional)</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="guest@example.com"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="address">Address (optional)</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="City, state, etc."
            />
          </div>
        </CardContent>
      </Card>

      {/* Stay dates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" />
            Stay
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="check_in">Check-in *</Label>
              <Input
                id="check_in"
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                min={todayISO()}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="check_out">Check-out *</Label>
              <Input
                id="check_out"
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                min={checkIn}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Nights</Label>
              <div className="h-10 px-3 flex items-center rounded-md border border-input bg-muted/50 text-sm tabular-nums">
                {nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "—"}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="special_requests">Special requests (optional)</Label>
            <Textarea
              id="special_requests"
              rows={2}
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              placeholder="Ground floor preference, late check-in, dietary notes, etc."
            />
          </div>
        </CardContent>
      </Card>

      {/* Room selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BedDouble className="h-5 w-5 text-primary" />
            Select rooms
            {Object.keys(selections).length > 0 && (
              <Badge variant="success" className="ml-2">
                {Object.keys(selections).length} selected
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingRooms ? (
            <div className="py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading available
              rooms…
            </div>
          ) : roomFetchError ? (
            <div className="py-8 text-center text-sm text-destructive">
              {roomFetchError}
            </div>
          ) : availableRooms.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {nights > 0
                ? "No rooms available for the selected dates."
                : "Set valid dates above to see available rooms."}
            </div>
          ) : (
            <div className="space-y-6">
              {orderedTypes.map((type) => (
                <div key={type}>
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    {type}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {grouped[type].map((room) => {
                      const isSelected = !!selections[room.id];
                      const sel = selections[room.id];
                      return (
                        <div
                          key={room.id}
                          className={cn(
                            "rounded-md border transition-all overflow-hidden",
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => toggleRoom(room)}
                            className="w-full flex items-center justify-between px-3 py-2 text-left"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={cn(
                                  "h-5 w-5 rounded border flex items-center justify-center transition-colors",
                                  isSelected
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-input"
                                )}
                              >
                                {isSelected && <Check className="h-3 w-3" />}
                              </div>
                              <div>
                                <p className="font-medium text-sm">
                                  #{room.room_number} · {room.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Sleeps{" "}
                                  {room.extra_capacity > 0
                                    ? `${room.base_occupancy}+${room.extra_capacity}`
                                    : room.base_occupancy}
                                </p>
                              </div>
                            </div>
                            <div className="text-sm font-semibold tabular-nums">
                              {formatCurrency(room.base_price)}
                              <span className="text-xs font-normal text-muted-foreground">
                                /night
                              </span>
                            </div>
                          </button>

                          {isSelected && (
                            <div className="border-t border-primary/20 px-3 py-2.5 bg-background space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <Label
                                  htmlFor={`guests-${room.id}`}
                                  className="text-xs"
                                >
                                  Guests
                                </Label>
                                <Input
                                  id={`guests-${room.id}`}
                                  type="number"
                                  min={1}
                                  max={room.max_occupancy}
                                  value={sel.guests}
                                  onChange={(e) =>
                                    updateRoomGuests(
                                      room.id,
                                      Math.min(
                                        Math.max(
                                          1,
                                          parseInt(e.target.value) || 1
                                        ),
                                        room.max_occupancy
                                      )
                                    )
                                  }
                                  className="h-8 w-20 text-xs"
                                />
                              </div>
                              {addons.length > 0 && (
                                <div className="space-y-1">
                                  <Label className="text-xs">Add-ons</Label>
                                  {addons.map((addon) => {
                                    const selected = sel.addons.find(
                                      (a) => a.addon_id === addon.id
                                    );
                                    return (
                                      <div
                                        key={addon.id}
                                        className="flex items-center justify-between gap-2"
                                      >
                                        <button
                                          type="button"
                                          onClick={() =>
                                            toggleAddon(room.id, addon)
                                          }
                                          className="flex items-center gap-2 text-xs flex-1 text-left"
                                        >
                                          <div
                                            className={cn(
                                              "h-4 w-4 rounded border flex items-center justify-center",
                                              selected
                                                ? "border-primary bg-primary text-primary-foreground"
                                                : "border-input"
                                            )}
                                          >
                                            {selected && (
                                              <Check className="h-2.5 w-2.5" />
                                            )}
                                          </div>
                                          <span>
                                            {addon.name}{" "}
                                            <span className="text-muted-foreground">
                                              ({formatCurrency(addon.price)}
                                              {addon.is_per_night
                                                ? "/night"
                                                : ""}
                                              )
                                            </span>
                                          </span>
                                        </button>
                                        {selected && addon.max_per_room > 1 && (
                                          <Input
                                            type="number"
                                            min={1}
                                            max={addon.max_per_room}
                                            value={selected.quantity}
                                            onChange={(e) =>
                                              updateAddonQuantity(
                                                room.id,
                                                addon.id,
                                                Math.min(
                                                  Math.max(
                                                    1,
                                                    parseInt(e.target.value) ||
                                                      1
                                                  ),
                                                  addon.max_per_room
                                                )
                                              )
                                            }
                                            className="h-7 w-14 text-xs"
                                          />
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Initial payment */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <IndianRupee className="h-5 w-5 text-primary" />
            Initial payment (optional)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enablePayment}
              onChange={(e) => setEnablePayment(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-input"
            />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Record a payment now</p>
              <p className="text-xs text-muted-foreground">
                If the guest pays at the desk during check-in. You can also add
                payments later from the booking detail page.
              </p>
            </div>
          </label>

          {enablePayment && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
              <div className="space-y-2">
                <Label htmlFor="payment_amount">Amount (₹)</Label>
                <Input
                  id="payment_amount"
                  type="number"
                  min="0"
                  step="50"
                  value={paymentAmount || ""}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment_mode">Mode</Label>
                <select
                  id="payment_mode"
                  value={paymentMode}
                  onChange={(e) =>
                    setPaymentMode(
                      e.target.value as "upi" | "cash" | "bank"
                    )
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="bank">Bank transfer</option>
                </select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="payment_ref">Reference number (optional)</Label>
                <Input
                  id="payment_ref"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="UPI transaction ID, receipt number, etc."
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="payment_notes">Notes (optional)</Label>
                <Input
                  id="payment_notes"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary + Submit */}
      <Card className="sticky bottom-4 shadow-lg">
        <CardContent className="pt-6">
          <div className="space-y-1.5 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Rooms ({Object.keys(selections).length} ×{" "}
                {nights || 0} night{nights === 1 ? "" : "s"})
              </span>
              <span className="tabular-nums">
                {formatCurrency(roomsSubtotal)}
              </span>
            </div>
            {addonsSubtotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Add-ons</span>
                <span className="tabular-nums">
                  {formatCurrency(addonsSubtotal)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold pt-2 border-t">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(total)}</span>
            </div>
            {enablePayment && paymentAmount > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Balance after payment</span>
                <span className="tabular-nums">
                  {formatCurrency(Math.max(0, total - paymentAmount))}
                </span>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/bookings")}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || Object.keys(selections).length === 0}
            >
              {isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Save />
              )}
              Confirm booking
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
