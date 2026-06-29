"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogOut, Loader2, IndianRupee } from "lucide-react";
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
import { formatCurrency } from "@/lib/utils";
import { checkoutBookingRoom } from "./actions";

type Props = {
  bookingRoomId: string;
  bookingId: string;
  roomName: string;
  bookingBalance: number;
  openRoomCount: number;
};

export function CheckoutRoomButton({
  bookingRoomId,
  bookingId,
  roomName,
  bookingBalance,
  openRoomCount,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Checking out the only remaining open room promotes the booking to
  // checked_out — the RPC blocks that when a balance is owed. Any earlier room
  // can be vacated freely. Mirror the RPC gate in the UI (defense in depth).
  const isFinalCheckout = openRoomCount === 1;
  const blockedByBalance = isFinalCheckout && bookingBalance > 0;

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await checkoutBookingRoom(bookingRoomId, bookingId);
      if (result.success) {
        toast.success(`${roomName} checked out.`);
        setOpen(false);
        router.refresh();
      } else {
        // Includes the RPC's balance exception text if the UI gate is bypassed.
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
          title={
            blockedByBalance
              ? `Balance ${formatCurrency(bookingBalance, "Rs. ")} due. Record payment first.`
              : undefined
          }
        >
          <LogOut className="h-3.5 w-3.5" />
          Check out room
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        {blockedByBalance ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <IndianRupee className="h-4 w-4 text-destructive" />
                Balance due
              </DialogTitle>
              <DialogDescription>
                Balance {formatCurrency(bookingBalance, "Rs. ")} due. Record
                payment first. This is the last open room, so checking it out
                would complete the booking — settle the balance in the payment
                ledger before checkout.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LogOut className="h-4 w-4 text-primary" />
                Check out room
              </DialogTitle>
              <DialogDescription>
                Check out {roomName} now? The booking stays open if other rooms
                are still occupied.
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
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Check out room
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
