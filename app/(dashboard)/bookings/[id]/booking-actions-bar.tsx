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
import {
  updateBookingStatus,
  checkoutEntireBooking,
  cancelCheckedOutBooking,
} from "./actions";
import type { BookingStatus } from "@/lib/types";

type Props = {
  bookingId: string;
  status: BookingStatus;
  hasIdProof: boolean;
  openRoomCount: number;
  bookingBalance: number;
};

export function BookingActionsBar({
  bookingId,
  status,
  hasIdProof,
  openRoomCount,
  bookingBalance,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [checkInWarning, setCheckInWarning] = useState(false);
  const [checkoutAllOpen, setCheckoutAllOpen] = useState(false);
  const [cancelCheckedOutOpen, setCancelCheckedOutOpen] = useState(false);
  const [cancelCheckedOutReason, setCancelCheckedOutReason] = useState("");

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

  // Full checkout now goes through checkout_entire_booking (vacates every
  // remaining room; the DB trigger promotes the booking). No balance gate —
  // a guest can leave with a balance owed; that's a separate billing concern.
  const handleConfirmCheckoutAll = () => {
    startTransition(async () => {
      const result = await checkoutEntireBooking(bookingId);
      if (result.success) {
        toast.success("Guest checked out.");
        setCheckoutAllOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not check out the booking.");
      }
    });
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

  // Soft-cancel a checked-out booking (test / mistaken bookings). Goes through
  // the dedicated RPC, not the normal status transition (which forbids it).
  const cancelCheckedOutReasonValid =
    cancelCheckedOutReason.trim().length >= 5;
  const handleConfirmCancelCheckedOut = () => {
    if (!cancelCheckedOutReasonValid) return;
    startTransition(async () => {
      const result = await cancelCheckedOutBooking({
        booking_id: bookingId,
        reason: cancelCheckedOutReason.trim(),
      });
      if (result.success) {
        toast.success("Booking cancelled and removed from reports.");
        setCancelCheckedOutOpen(false);
        setCancelCheckedOutReason("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  // Determine which actions are available based on current status
  const canConfirm = status === "pending";
  const canCheckIn = status === "confirmed";
  const canCheckOut = status === "checked_in";
  const canCancel = ["pending", "confirmed", "checked_in"].includes(status);
  const canMarkNoShow = ["pending", "confirmed"].includes(status);
  // Checked-out bookings have no normal actions, but an admin can soft-cancel a
  // test / mistaken one to pull it out of revenue and occupancy reports.
  const canCancelCheckedOut = status === "checked_out";

  if (
    !canConfirm &&
    !canCheckIn &&
    !canCheckOut &&
    !canCancel &&
    !canCancelCheckedOut
  ) {
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
          <Button
            onClick={() => setCheckoutAllOpen(true)}
            disabled={isPending}
            title={
              bookingBalance > 0
                ? `Balance ${formatCurrency(bookingBalance, "Rs. ")} due. Record payment first.`
                : undefined
            }
          >
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
        {canCancelCheckedOut && (
          <Button
            variant="outline"
            onClick={() => setCancelCheckedOutOpen(true)}
            disabled={isPending}
            className="text-destructive hover:bg-destructive/5 hover:text-destructive"
          >
            <XIcon />
            Cancel booking
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

      {/* Cancel a checked-out booking (test / mistaken cleanup) */}
      <Dialog
        open={cancelCheckedOutOpen}
        onOpenChange={(o) => {
          setCancelCheckedOutOpen(o);
          if (!o) setCancelCheckedOutReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Cancel this checked-out booking?
            </DialogTitle>
            <DialogDescription>
              This is a checked-out guest booking. Only cancel this if it was a
              test booking. This will remove it from revenue and occupancy
              reports.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel_checked_out_reason">
              Reason (required)
            </Label>
            <Textarea
              id="cancel_checked_out_reason"
              rows={3}
              value={cancelCheckedOutReason}
              onChange={(e) => setCancelCheckedOutReason(e.target.value)}
              placeholder="e.g. Test booking created during setup, confirmed with Shubham."
            />
            {!cancelCheckedOutReasonValid && (
              <p className="text-xs text-muted-foreground">
                Enter at least 5 characters to enable the button.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelCheckedOutOpen(false)}
              disabled={isPending}
            >
              Keep booking
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmCancelCheckedOut}
              disabled={isPending || !cancelCheckedOutReasonValid}
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

      {/* Check out all rooms confirmation */}
      <AlertDialog open={checkoutAllOpen} onOpenChange={setCheckoutAllOpen}>
        <AlertDialogContent>
          {bookingBalance > 0 ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <IndianRupee className="h-5 w-5 text-destructive" />
                  Balance due
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Balance {formatCurrency(bookingBalance, "Rs. ")} due. Record
                  payment first. Checking out all rooms completes the booking,
                  which isn&apos;t allowed while a balance is owed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Close</AlertDialogCancel>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <LogOut className="h-5 w-5 text-primary" />
                  Check out all {openRoomCount} room
                  {openRoomCount === 1 ? "" : "s"}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will complete the booking and send the thank-you message
                  to the guest.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    handleConfirmCheckoutAll();
                  }}
                  disabled={isPending}
                >
                  {isPending ? <Loader2 className="animate-spin" /> : null}
                  Check out all
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
