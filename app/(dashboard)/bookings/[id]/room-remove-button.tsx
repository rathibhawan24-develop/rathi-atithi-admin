"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { removeRoomFromBooking } from "./actions";

type Props = {
  bookingId: string;
  bookingStatus: string;
  bookingRoomId: string;
  roomLabel: string;
  totalRoomsInBooking: number;
};

export function RoomRemoveButton({
  bookingId,
  bookingStatus,
  bookingRoomId,
  roomLabel,
  totalRoomsInBooking,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Hide remove on terminal statuses OR if this is the last room
  if (
    bookingStatus === "checked_out" ||
    bookingStatus === "cancelled" ||
    totalRoomsInBooking <= 1
  ) {
    return null;
  }

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await removeRoomFromBooking({
        booking_id: bookingId,
        booking_room_id: bookingRoomId,
      });
      if (result.success) {
        toast.success("Room removed.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not remove room.");
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
        >
          <Trash2 className="h-3 w-3" />
          Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this room?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{roomLabel}</span>{" "}
            will be removed from this booking, along with any add-ons attached
            to it. The booking total and balance will recalculate automatically.
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Remove room
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
