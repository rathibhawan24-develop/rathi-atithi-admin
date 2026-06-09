"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Percent, IndianRupee, Loader2, Tag, X } from "lucide-react";
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
import { formatCurrency, cn } from "@/lib/utils";
import { setBookingDiscount } from "./actions";

type DiscountType = "none" | "percent" | "amount";

type Props = {
  bookingId: string;
  bookingStatus: string;
  grossSubtotal: number;        // rooms_subtotal + addons_subtotal
  currentDiscountType: DiscountType;
  currentDiscountValue: number;
  currentDiscountAmount: number;
};

export function DiscountButton({
  bookingId,
  bookingStatus,
  grossSubtotal,
  currentDiscountType,
  currentDiscountValue,
  currentDiscountAmount,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [discountType, setDiscountType] = useState<DiscountType>(
    currentDiscountType === "none" ? "percent" : currentDiscountType
  );
  const [discountValue, setDiscountValue] = useState<number>(
    currentDiscountValue || 0
  );

  // Live preview of the discount amount and new total
  const previewAmount = useMemo(() => {
    if (discountValue <= 0) return 0;
    if (discountType === "percent") {
      return Math.min(Math.round(grossSubtotal * discountValue) / 100, grossSubtotal);
    }
    return Math.min(discountValue, grossSubtotal);
  }, [discountType, discountValue, grossSubtotal]);

  const newTotal = grossSubtotal - previewAmount;
  const hasExistingDiscount = currentDiscountType !== "none";

  const validate = (): string | null => {
    if (discountValue < 0) return "Discount cannot be negative";
    if (discountType === "percent" && discountValue > 100)
      return "Percentage cannot exceed 100";
    if (discountType === "amount" && discountValue > grossSubtotal)
      return `Discount cannot exceed gross subtotal of ${formatCurrency(grossSubtotal)}`;
    return null;
  };

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    startTransition(async () => {
      const result = await setBookingDiscount({
        booking_id: bookingId,
        discount_type: discountValue === 0 ? "none" : discountType,
        discount_value: discountValue,
      });
      if (result.success) {
        toast.success("Discount applied.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not apply discount.");
      }
    });
  };

  const handleRemove = () => {
    startTransition(async () => {
      const result = await setBookingDiscount({
        booking_id: bookingId,
        discount_type: "none",
        discount_value: 0,
      });
      if (result.success) {
        toast.success("Discount removed.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not remove discount.");
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
          <Tag className="h-3.5 w-3.5" />
          {hasExistingDiscount ? "Edit discount" : "Apply discount"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" />
            {hasExistingDiscount ? "Edit discount" : "Apply discount"}
          </DialogTitle>
          <DialogDescription>
            Discount applies to the gross subtotal (rooms + add-ons). The
            booking total and balance recalculate automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleApply} className="space-y-4">
          {/* Type toggle */}
          <div className="space-y-2">
            <Label className="text-xs">Discount type</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDiscountType("percent")}
                disabled={isPending}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm transition-colors",
                  discountType === "percent"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border text-muted-foreground hover:border-border/80"
                )}
              >
                <Percent className="h-4 w-4" />
                Percentage
              </button>
              <button
                type="button"
                onClick={() => setDiscountType("amount")}
                disabled={isPending}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm transition-colors",
                  discountType === "amount"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border text-muted-foreground hover:border-border/80"
                )}
              >
                <IndianRupee className="h-4 w-4" />
                Fixed amount
              </button>
            </div>
          </div>

          {/* Value input */}
          <div className="space-y-1.5">
            <Label htmlFor="disc_val" className="text-xs">
              {discountType === "percent" ? "Percentage (%)" : "Amount (₹)"}
            </Label>
            <Input
              id="disc_val"
              type="number"
              min={0}
              max={discountType === "percent" ? 100 : grossSubtotal}
              step={discountType === "percent" ? "0.01" : "1"}
              value={discountValue || ""}
              onChange={(e) =>
                setDiscountValue(parseFloat(e.target.value) || 0)
              }
              placeholder={discountType === "percent" ? "10" : "500"}
              disabled={isPending}
              autoFocus
              className="h-10 text-base"
            />
          </div>

          {/* Live preview */}
          <div className="rounded-md bg-muted/40 p-3 space-y-1 text-sm tabular-nums">
            <div className="flex justify-between text-muted-foreground">
              <span>Gross subtotal</span>
              <span>{formatCurrency(grossSubtotal)}</span>
            </div>
            <div className="flex justify-between text-primary">
              <span>Discount</span>
              <span>− {formatCurrency(previewAmount)}</span>
            </div>
            <div className="flex justify-between font-semibold pt-1 border-t border-border">
              <span>New total</span>
              <span>{formatCurrency(newTotal)}</span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2 sm:justify-between">
            <div>
              {hasExistingDiscount && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRemove}
                  disabled={isPending}
                  className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <X className="h-4 w-4" />
                  Remove discount
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
                Apply
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
