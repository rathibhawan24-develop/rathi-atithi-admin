"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Edit2, Loader2, BedDouble, Sparkles } from "lucide-react";
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
import { updateBookingRoom } from "./actions";

export type AvailableAddon = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_per_night: boolean;
  max_per_room: number;
};

type Props = {
  bookingId: string;
  bookingStatus: string;
  bookingRoomId: string;
  roomNumber: string;
  roomLabel: string;
  maxOccupancy: number;
  nights: number;
  currentGuests: number;
  currentAddons: { addon_id: string; quantity: number }[];
  availableAddons: AvailableAddon[];
};

export function RoomEditButton({
  bookingId,
  bookingStatus,
  bookingRoomId,
  roomNumber,
  roomLabel,
  maxOccupancy,
  nights,
  currentGuests,
  currentAddons,
  availableAddons,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [guests, setGuests] = useState(currentGuests);
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const a of availableAddons) {
      const existing = currentAddons.find((c) => c.addon_id === a.id);
      initial[a.id] = existing?.quantity ?? 0;
    }
    return initial;
  });

  // Live total preview for the selected add-ons
  const addonsTotal = useMemo(() => {
    let sum = 0;
    for (const a of availableAddons) {
      const qty = quantities[a.id] ?? 0;
      if (qty <= 0) continue;
      sum += a.price * qty * (a.is_per_night ? nights : 1);
    }
    return sum;
  }, [quantities, availableAddons, nights]);

  const validate = (): string | null => {
    if (guests < 1) return "Guests must be at least 1";
    if (guests > maxOccupancy)
      return `Maximum ${maxOccupancy} guests for this room`;
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
      const result = await updateBookingRoom({
        booking_id: bookingId,
        booking_room_id: bookingRoomId,
        guests,
        addons: payload,
      });
      if (result.success) {
        toast.success("Room updated.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not update room.");
      }
    });
  };

  // Hide button on checked-out and cancelled bookings (historical, immutable)
  if (bookingStatus === "checked_out" || bookingStatus === "cancelled") {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs gap-1.5"
        >
          <Edit2 className="h-3 w-3" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BedDouble className="h-4 w-4 text-primary" />
            #{roomNumber} · {roomLabel}
          </DialogTitle>
          <DialogDescription>
            Update guests and add-ons for this room. Billing recalculates
            automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Guests */}
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="re_guests" className="text-sm">
              Guests in this room
            </Label>
            <Input
              id="re_guests"
              type="number"
              min={1}
              max={maxOccupancy}
              value={guests}
              onChange={(e) => setGuests(parseInt(e.target.value, 10) || 1)}
              disabled={isPending}
              className="w-24 h-9 text-sm"
            />
          </div>
          <p className="text-[11px] text-muted-foreground -mt-3">
            Room capacity: {maxOccupancy} guests
          </p>

          {/* Add-ons */}
          <div className="space-y-3 pt-3 border-t border-border">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <Label className="text-sm">Add-ons</Label>
            </div>

            {availableAddons.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                No add-ons available.
              </p>
            )}

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
                      {a.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {a.description}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {formatCurrency(a.price)}
                        {a.is_per_night ? " per night" : " one-time"}
                        {a.max_per_room > 1 && (
                          <span> · max {a.max_per_room}/room</span>
                        )}
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
                            [a.id]: parseInt(e.target.value, 10) || 0,
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

          {/* Live total preview */}
          {addonsTotal > 0 && (
            <div className="flex items-center justify-between pt-3 border-t border-border text-sm">
              <span className="text-muted-foreground">Add-ons subtotal</span>
              <span className="font-semibold tabular-nums">
                {formatCurrency(addonsTotal)}
              </span>
            </div>
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
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
