"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IndianRupee, Loader2, X } from "lucide-react";
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
import { formatCurrency } from "@/lib/utils";
import { setBookingOtherCharges } from "./actions";

type Props = {
  bookingId: string;
  bookingStatus: string;
  currentAmount: number;
  currentNote: string | null;
};

export function OtherChargesButton({
  bookingId,
  bookingStatus,
  currentAmount,
  currentNote,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [amount, setAmount] = useState<number>(currentAmount || 0);
  const [note, setNote] = useState<string>(currentNote ?? "");

  const hasExisting = currentAmount > 0;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount < 0) {
      toast.error("Amount cannot be negative.");
      return;
    }
    startTransition(async () => {
      const result = await setBookingOtherCharges({
        booking_id: bookingId,
        amount,
        note: note.trim() || null,
      });
      if (result.success) {
        toast.success(amount > 0 ? "Other charges saved." : "Other charges removed.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not save other charges.");
      }
    });
  };

  const handleRemove = () => {
    startTransition(async () => {
      const result = await setBookingOtherCharges({
        booking_id: bookingId,
        amount: 0,
        note: null,
      });
      if (result.success) {
        toast.success("Other charges removed.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not remove other charges.");
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
          className="h-8 px-3 text-xs gap-1.5"
        >
          <IndianRupee className="h-3.5 w-3.5" />
          {hasExisting ? "Edit charges" : "Other charges"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IndianRupee className="h-4 w-4 text-primary" />
            {hasExisting ? "Edit other charges" : "Add other charges"}
          </DialogTitle>
          <DialogDescription>
            A free-form positive charge (e.g. extra bed, late checkout). The
            booking total and balance recalculate automatically. For refunds or
            goodwill credits, use Apply discount instead.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Amount input */}
          <div className="space-y-1.5">
            <Label htmlFor="oc_amount" className="text-xs">
              Amount (₹)
            </Label>
            <Input
              id="oc_amount"
              type="number"
              min={0}
              step="1"
              value={amount || ""}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              placeholder="1500"
              disabled={isPending}
              autoFocus
              className="h-10 text-base"
            />
          </div>

          {/* Note textarea */}
          <div className="space-y-1.5">
            <Label htmlFor="oc_note" className="text-xs">
              Note (optional)
            </Label>
            <Textarea
              id="oc_note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Extra bed for 5 of 15 nights"
              disabled={isPending}
              maxLength={200}
              rows={2}
            />
          </div>

          {/* Preview */}
          <div className="rounded-md bg-muted/40 p-3 space-y-1 text-sm tabular-nums">
            <div className="flex justify-between text-foreground">
              <span>{note.trim() || "Other charges"}</span>
              <span className="font-medium">{formatCurrency(amount)}</span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2 sm:justify-between">
            <div>
              {hasExisting && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRemove}
                  disabled={isPending}
                  className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <X className="h-4 w-4" />
                  Remove
                </Button>
              )}
            </div>
            <div className="flex gap-2">
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
                Save
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
