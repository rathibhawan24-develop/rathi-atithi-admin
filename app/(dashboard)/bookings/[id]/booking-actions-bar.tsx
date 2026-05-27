"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  LogIn,
  LogOut,
  X as XIcon,
  Loader2,
  AlertTriangle,
  IndianRupee,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency } from "@/lib/utils";
import { updateBookingStatus } from "./actions";
import type { BookingStatus } from "@/lib/types";

type Props = {
  bookingId: string;
  status: BookingStatus;
  hasIdProof: boolean;
  balance: number;
};

export function BookingActionsBar({
  bookingId,
  status,
  hasIdProof,
  balance,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [checkInWarning, setCheckInWarning] = useState(false);
  const [balanceBlocked, setBalanceBlocked] = useState(false);

  const runTransition = (
    newStatus: BookingStatus,
    reason?: string,
    successMsg?: string
  ) => {
    startTransition(async () => {
      const result = await updateBookingStatus(bookingId, newStatus, reason);
      if (result.success) {
        toast.success(
          successMsg ?? `Status changed to ${newStatus.replace("_", " ")}.`
        );
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleCheckIn = () => {
    if (!hasIdProof) {
      setCheckInWarning(true);
      return;
    }
    runTransition("checked_in", undefined, "Guest checked in.");
  };

  const handleCheckOut = () => {
    if (balance > 0) {
      setBalanceBlocked(true);
      return;
    }
    runTransition("checked_out", undefined, "Guest checked out.");
  };

  const handleConfirmCancel = () => {
    runTransition(
      "cancelled",
      cancelReason.trim() || undefined,
      "Booking cancelled."
    );
    setCancelOpen(false);
    setCancelReason("");
  };

  // Determine which actions are available based on current status
  const canConfirm = status === "pending";
  const canCheckIn = status === "confirmed";
  const canCheckOut = status === "checked_in";
  const canCancel = ["pending", "confirmed", "checked_in"].includes(status);
  const canMarkNoShow = ["pending", "confirmed"].includes(status);

  if (!canConfirm && !canCheckIn && !canCheckOut && !canCancel) {
    return null; // terminal status — no actions
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canConfirm && (
          <Button
            onClick={() =>
              runTransition("confirmed", undefined, "Booking confirmed.")
            }
            disabled={isPending}
          >
            {isPending ? <Loader2 className="animate-spin" /> : <Check />}
            Confirm
          </Button>
        )}
        {canCheckIn && (
          <Button onClick={handleCheckIn} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : <LogIn />}
            Check in
          </Button>
        )}
        {canCheckOut && (
          <Button onClick={handleCheckOut} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : <LogOut />}
            Check out
          </Button>
        )}
        {canMarkNoShow && (
          <Button
            variant="outline"
            onClick={() =>
              runTransition("no_show", undefined, "Marked as no-show.")
            }
            disabled={isPending}
          >
            Mark no-show
          </Button>
        )}
        {canCancel && (
          <Button
            variant="outline"
            onClick={() => setCancelOpen(true)}
            disabled={isPending}
            className="text-destructive hover:bg-destructive/5 hover:text-destructive"
          >
            <XIcon />
            Cancel
          </Button>
        )}
      </div>

      {/* Cancel dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this booking?</DialogTitle>
            <DialogDescription>
              The booking will be marked as cancelled. Refunds (if any) can be
              recorded as negative payments in the ledger.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel_reason">Reason (optional)</Label>
            <Textarea
              id="cancel_reason"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Guest cancelled by phone, travel plans changed, etc."
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelOpen(false)}
              disabled={isPending}
            >
              Keep booking
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmCancel}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="animate-spin" /> : null}
              Cancel booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Check-in without ID proof warning */}
      <AlertDialog open={checkInWarning} onOpenChange={setCheckInWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              No ID proof captured
            </AlertDialogTitle>
            <AlertDialogDescription>
              Indian law (Form C) requires ID proof for all hotel guests. Are
              you sure you want to check in without recording it? You can still
              add the ID proof later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Capture ID first</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setCheckInWarning(false);
                runTransition("checked_in", undefined, "Guest checked in.");
              }}
            >
              Check in anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Check-out blocked: outstanding balance */}
      <AlertDialog open={balanceBlocked} onOpenChange={setBalanceBlocked}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <IndianRupee className="h-5 w-5 text-destructive" />
              Outstanding balance: {formatCurrency(balance)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This guest cannot be checked out while a balance is owed. Please
              record a payment for the outstanding amount, or — if the balance
              is being written off — record an offsetting payment with a note
              explaining why (e.g. &quot;Compensation for service issue&quot;).
              Once balance is zero or negative, check-out will be allowed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setBalanceBlocked(false)}>
              Go to payment ledger
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
