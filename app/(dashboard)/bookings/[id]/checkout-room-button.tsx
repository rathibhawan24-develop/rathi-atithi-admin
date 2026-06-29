"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { checkoutBookingRoom } from "./actions";

type Props = {
  bookingRoomId: string;
  bookingId: string;
  roomName: string;
};

export function CheckoutRoomButton({
  bookingRoomId,
  bookingId,
  roomName,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await checkoutBookingRoom(bookingRoomId, bookingId);
      if (result.success) {
        toast.success(`${roomName} checked out.`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not check out the room.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs gap-1.5"
        >
          <LogOut className="h-3.5 w-3.5" />
          Check out room
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="h-4 w-4 text-primary" />
            Check out room
          </DialogTitle>
          <DialogDescription>
            Check out {roomName} now? The booking stays open if other rooms are
            still occupied.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Check out room
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
