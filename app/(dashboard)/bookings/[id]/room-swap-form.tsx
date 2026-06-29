"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Repeat2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { swapBookingRoom } from "./actions";

export type RoomOption = {
  id: string;
  room_number: string;
  name: string;
  room_type: string;
  base_price: number;
  max_occupancy: number;
  is_available: boolean;
  // Override-aware pricing for the booking's stay window.
  // Falls back to base_price when no override applies.
  stay_total?: number;
  effective_nightly?: number;
  is_uniform?: boolean;
  override_applied?: boolean;
  override_name?: string | null;
};

type Props = {
  bookingId: string;
  bookingStatus: string;
  bookingRoomId: string;
  currentRoomId: string;
  currentRoomLabel: string;
  currentGuests: number;
  availableRooms: RoomOption[];
};

export function RoomSwapButton({
  bookingId,
  bookingStatus,
  bookingRoomId,
  currentRoomId,
  currentRoomLabel,
  currentGuests,
  availableRooms,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [targetRoomId, setTargetRoomId] = useState<string>("");

  // Rooms eligible for swap: not the current room, available, and capacity >= current guests
  const eligibleRooms = availableRooms.filter(
    (r) =>
      r.id !== currentRoomId &&
      r.is_available &&
      r.max_occupancy >= currentGuests
  );

  const selectedRoom = availableRooms.find((r) => r.id === targetRoomId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetRoomId) {
      toast.error("Pick a room to swap to.");
      return;
    }
    startTransition(async () => {
      const result = await swapBookingRoom({
        booking_id: bookingId,
        old_booking_room_id: bookingRoomId,
        new_room_id: targetRoomId,
      });
      if (result.success) {
        toast.success("Room swapped.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not swap room.");
      }
    });
  };

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
          <Repeat2 className="h-3 w-3" />
          Change room
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Change room</DialogTitle>
          <DialogDescription>
            Move from <span className="font-medium">{currentRoomLabel}</span>{" "}
            to a different room. Guests and add-ons carry over; the new
            room&apos;s current rate is applied.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Available rooms</Label>
            {eligibleRooms.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                No other rooms are available for these dates with capacity for{" "}
                {currentGuests} guests.
              </p>
            )}
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {eligibleRooms.map((r) => (
                <label
                  key={r.id}
                  className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                    targetRoomId === r.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-border/80"
                  }`}
                >
                  <input
                    type="radio"
                    name="target_room"
                    value={r.id}
                    checked={targetRoomId === r.id}
                    onChange={() => setTargetRoomId(r.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      #{r.room_number} · {r.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {r.room_type} · capacity {r.max_occupancy}
                    </p>
                    {r.override_applied && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[hsl(28_75%_45%/0.12)] px-1.5 py-0.5 text-[10px] font-medium text-[hsl(28_75%_45%)]">
                        <Sparkles className="h-2.5 w-2.5" />
                        Special rate
                        {r.override_name ? ` · ${r.override_name}` : ""}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-medium tabular-nums shrink-0">
                    {formatCurrency(r.effective_nightly ?? r.base_price)}
                    {r.override_applied && r.is_uniform === false
                      ? " avg/night"
                      : "/night"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {selectedRoom && (
            <div className="rounded-md bg-muted/40 p-3 text-xs space-y-1">
              <p>
                New rate:{" "}
                <span className="font-medium tabular-nums">
                  {formatCurrency(
                    selectedRoom.effective_nightly ?? selectedRoom.base_price
                  )}
                  {selectedRoom.override_applied &&
                  selectedRoom.is_uniform === false
                    ? " avg/night"
                    : "/night"}
                </span>
              </p>
              <p className="text-muted-foreground">
                Existing add-ons will carry over. After swap, you can adjust
                the rate manually via the Edit dialog if needed.
              </p>
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
            <Button type="submit" disabled={isPending || !targetRoomId}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Swap room
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
