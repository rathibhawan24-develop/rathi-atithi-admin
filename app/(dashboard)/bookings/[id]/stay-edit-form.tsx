"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Edit2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateBookingStay } from "./actions";

export type StayEditRoom = {
  booking_room_id: string;
  room_number: string;
  room_label: string;
  current_guests: number;
  max_occupancy: number;
};

type Props = {
  bookingId: string;
  initial: {
    check_in: string;       // ISO date 'YYYY-MM-DD'
    check_out: string;
    special_requests: string | null;
    status: string;         // bookings.status (pending|confirmed|checked_in|...)
  };
  rooms: StayEditRoom[];
};

export function StayEditButton({ bookingId, initial, rooms }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [checkIn, setCheckIn] = useState(initial.check_in);
  const [checkOut, setCheckOut] = useState(initial.check_out);
  const [special, setSpecial] = useState(initial.special_requests ?? "");
  const [guestCounts, setGuestCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(rooms.map((r) => [r.booking_room_id, r.current_guests]))
  );

  // After check-in, the check-in date can't be moved
  const checkInLocked = initial.status === "checked_in";

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    const a = new Date(checkIn + "T00:00:00");
    const b = new Date(checkOut + "T00:00:00");
    return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
  }, [checkIn, checkOut]);

  const validate = (): string | null => {
    if (!checkIn || !checkOut) return "Both dates are required";
    if (checkOut <= checkIn) return "Check-out must be after check-in";
    for (const r of rooms) {
      const g = guestCounts[r.booking_room_id];
      if (!g || g < 1) return `Enter at least 1 guest for #${r.room_number}`;
      if (g > r.max_occupancy)
        return `#${r.room_number} fits maximum ${r.max_occupancy} guests`;
    }
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    startTransition(async () => {
      const result = await updateBookingStay({
        booking_id: bookingId,
        check_in: checkIn,
        check_out: checkOut,
        special_requests: special.trim() || null,
        room_guests: rooms.map((r) => ({
          booking_room_id: r.booking_room_id,
          guests: guestCounts[r.booking_room_id],
        })),
      });

      if (result.success) {
        toast.success("Booking updated.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not update booking.");
      }
    });
  };

  // Don't render edit option for checked-out or cancelled bookings.
  if (initial.status === "checked_out" || initial.status === "cancelled") {
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
          Change date
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Change date</DialogTitle>
          <DialogDescription>
            Update stay dates, guest counts, and special requests. Rates remain
            locked at the original booking amount.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="se_ci" className="text-xs">
                Check-in
              </Label>
              <Input
                id="se_ci"
                type="date"
                value={checkIn}
                onChange={(e) => {
                  if (checkInLocked) return;
                  setCheckIn(e.target.value);
                  if (e.target.value && checkOut <= e.target.value) {
                    // Auto-bump check-out to the next day if invalid
                    const d = new Date(e.target.value + "T00:00:00");
                    d.setDate(d.getDate() + 1);
                    setCheckOut(d.toISOString().slice(0, 10));
                  }
                }}
                disabled={checkInLocked || isPending}
                className="h-10"
              />
              {checkInLocked && (
                <p className="text-[11px] text-muted-foreground">
                  Locked — guest has already checked in.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="se_co" className="text-xs">
                Check-out
              </Label>
              <Input
                id="se_co"
                type="date"
                value={checkOut}
                min={checkIn}
                onChange={(e) => setCheckOut(e.target.value)}
                disabled={isPending}
                className="h-10"
              />
            </div>
          </div>
          {nights > 0 && (
            <p className="text-xs text-muted-foreground">
              {nights} night{nights === 1 ? "" : "s"}
            </p>
          )}

          {rooms.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              <Label className="text-xs">Guests per room</Label>
              {rooms.map((r) => (
                <div
                  key={r.booking_room_id}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-sm">
                    #{r.room_number}{" "}
                    <span className="text-muted-foreground">
                      · {r.room_label}
                    </span>
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={r.max_occupancy}
                    value={guestCounts[r.booking_room_id]}
                    onChange={(e) =>
                      setGuestCounts((prev) => ({
                        ...prev,
                        [r.booking_room_id]: parseInt(e.target.value, 10) || 1,
                      }))
                    }
                    disabled={isPending}
                    className="w-20 h-9 text-sm"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5 pt-2 border-t border-border">
            <Label htmlFor="se_sr" className="text-xs">
              Special requests
            </Label>
            <Textarea
              id="se_sr"
              value={special}
              onChange={(e) => setSpecial(e.target.value)}
              placeholder="Any preferences or arrangements"
              rows={3}
              disabled={isPending}
            />
          </div>

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
