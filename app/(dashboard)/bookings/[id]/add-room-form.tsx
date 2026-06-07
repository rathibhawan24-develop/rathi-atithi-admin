"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Loader2, BedDouble, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { addRoomToBooking } from "./actions";
import type { AvailableAddon } from "./room-edit-form";
import type { RoomOption } from "./room-swap-form";

type Props = {
  bookingId: string;
  bookingStatus: string;
  nights: number;
  alreadyBookedRoomIds: string[];
  availableRooms: RoomOption[];
  availableAddons: AvailableAddon[];
};

export function AddRoomButton({
  bookingId,
  bookingStatus,
  nights,
  alreadyBookedRoomIds,
  availableRooms,
  availableAddons,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [guests, setGuests] = useState(1);
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(availableAddons.map((a) => [a.id, 0]))
  );

  const eligibleRooms = availableRooms.filter(
    (r) => r.is_available && !alreadyBookedRoomIds.includes(r.id)
  );
  const selectedRoom = availableRooms.find((r) => r.id === selectedRoomId);

  const roomSubtotal = useMemo(
    () => (selectedRoom ? selectedRoom.base_price * nights : 0),
    [selectedRoom, nights]
  );
  const addonsTotal = useMemo(() => {
    let sum = 0;
    for (const a of availableAddons) {
      const qty = quantities[a.id] ?? 0;
      if (qty <= 0) continue;
      sum += a.price * qty * (a.is_per_night ? nights : 1);
    }
    return sum;
  }, [quantities, availableAddons, nights]);

  const resetForm = () => {
    setSelectedRoomId("");
    setGuests(1);
    setQuantities(Object.fromEntries(availableAddons.map((a) => [a.id, 0])));
  };

  const validate = (): string | null => {
    if (!selectedRoomId) return "Pick a room to add";
    if (!selectedRoom) return "Selected room not found";
    if (guests < 1) return "Guests must be at least 1";
    if (guests > selectedRoom.max_occupancy)
      return `Maximum ${selectedRoom.max_occupancy} guests for this room`;
    for (const a of availableAddons) {
      const qty = quantities[a.id] ?? 0;
      if (qty < 0) return `Invalid quantity for ${a.name}`;
      if (qty > a.max_per_room)
        return `${a.name}: maximum ${a.max_per_room} per room`;
    }
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    const payload = Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([addon_id, quantity]) => ({ addon_id, quantity }));

    startTransition(async () => {
      const result = await addRoomToBooking({
        booking_id: bookingId,
        room_id: selectedRoomId,
        guests,
        addons: payload,
      });
      if (result.success) {
        toast.success("Room added to booking.");
        setOpen(false);
        resetForm();
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not add room.");
      }
    });
  };

  if (bookingStatus === "checked_out" || bookingStatus === "cancelled") {
    return null;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add room
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BedDouble className="h-4 w-4 text-primary" />
            Add a room to this booking
          </DialogTitle>
          <DialogDescription>
            The new room uses the existing booking dates ({nights} night
            {nights === 1 ? "" : "s"}). Billing recalculates automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Room picker */}
          <div className="space-y-2">
            <Label className="text-xs">Available rooms</Label>
            {eligibleRooms.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                No rooms available for these dates that aren&apos;t already in
                this booking.
              </p>
            )}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {eligibleRooms.map((r) => (
                <label
                  key={r.id}
                  className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                    selectedRoomId === r.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-border/80"
                  }`}
                >
                  <input
                    type="radio"
                    name="new_room"
                    value={r.id}
                    checked={selectedRoomId === r.id}
                    onChange={() => {
                      setSelectedRoomId(r.id);
                      // Default guests to 1 (or current value if reasonable)
                      if (guests > r.max_occupancy) setGuests(1);
                    }}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      #{r.room_number} · {r.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {r.room_type} · capacity {r.max_occupancy}
                    </p>
                  </div>
                  <span className="text-sm font-medium tabular-nums shrink-0">
                    {formatCurrency(r.base_price)}/night
                  </span>
                </label>
              ))}
            </div>
          </div>

          {selectedRoom && (
            <>
              {/* Guests */}
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="ar_guests" className="text-sm">
                  Guests in this room
                </Label>
                <Input
                  id="ar_guests"
                  type="number"
                  min={1}
                  max={selectedRoom.max_occupancy}
                  value={guests}
                  onChange={(e) =>
                    setGuests(parseInt(e.target.value, 10) || 1)
                  }
                  disabled={isPending}
                  className="w-24 h-9 text-sm"
                />
              </div>

              {/* Add-ons */}
              {availableAddons.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-border">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <Label className="text-sm">Add-ons (optional)</Label>
                  </div>
                  {availableAddons.map((a) => {
                    const qty = quantities[a.id] ?? 0;
                    const lineTotal =
                      qty > 0
                        ? a.price * qty * (a.is_per_night ? nights : 1)
                        : 0;
                    return (
                      <div
                        key={a.id}
                        className={`rounded-md border p-3 transition-colors ${
                          qty > 0
                            ? "border-primary/40 bg-primary/5"
                            : "border-border"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{a.name}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {formatCurrency(a.price)}
                              {a.is_per_night ? " per night" : " one-time"}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Input
                              type="number"
                              min={0}
                              max={a.max_per_room}
                              value={qty}
                              onChange={(e) =>
                                setQuantities((prev) => ({
                                  ...prev,
                                  [a.id]:
                                    parseInt(e.target.value, 10) || 0,
                                }))
                              }
                              disabled={isPending}
                              className="w-16 h-9 text-sm text-center"
                            />
                            {qty > 0 && (
                              <span className="text-[11px] font-medium text-primary tabular-nums">
                                {formatCurrency(lineTotal)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Live totals */}
              <div className="space-y-1 pt-3 border-t border-border text-sm tabular-nums">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Room subtotal ({nights} night{nights === 1 ? "" : "s"})
                  </span>
                  <span>{formatCurrency(roomSubtotal)}</span>
                </div>
                {addonsTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Add-ons subtotal
                    </span>
                    <span>{formatCurrency(addonsTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-border font-semibold">
                  <span>Adds to booking total</span>
                  <span>{formatCurrency(roomSubtotal + addonsTotal)}</span>
                </div>
              </div>
            </>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || !selectedRoomId}
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Add room
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
