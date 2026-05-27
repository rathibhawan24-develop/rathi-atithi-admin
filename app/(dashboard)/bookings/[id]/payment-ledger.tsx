"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Loader2,
  IndianRupee,
  Undo2,
  Wallet,
  Landmark,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { addPayment, deletePayment } from "./actions";
import type { Payment, PaymentMode } from "@/lib/types";

type Props = {
  bookingId: string;
  payments: Payment[];
  total: number;
  paid: number;
  balance: number;
  isAdmin: boolean;
  canRecordPayments: boolean; // false on cancelled/expired
};

const MODE_LABELS: Record<PaymentMode, string> = {
  upi: "UPI",
  cash: "Cash",
  bank: "Bank transfer",
};

const MODE_ICONS: Record<PaymentMode, React.ComponentType<{ className?: string }>> = {
  upi: Smartphone,
  cash: Wallet,
  bank: Landmark,
};

export function PaymentLedger({
  bookingId,
  payments,
  total,
  paid,
  balance,
  isAdmin,
  canRecordPayments,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [isRefund, setIsRefund] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<string | null>(null);

  // Form state
  const [amount, setAmount] = useState<number>(0);
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const openAddPayment = (refundMode: boolean) => {
    setIsRefund(refundMode);
    setAmount(refundMode ? 0 : Math.max(0, balance));
    setMode("cash");
    setReference("");
    setNotes("");
    setAddOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) {
      toast.error("Amount must be greater than zero.");
      return;
    }
    const signedAmount = isRefund ? -Math.abs(amount) : Math.abs(amount);

    startTransition(async () => {
      const result = await addPayment({
        booking_id: bookingId,
        amount: signedAmount,
        mode,
        reference_number: reference,
        notes,
      });
      if (result.success) {
        toast.success(isRefund ? "Refund recorded." : "Payment recorded.");
        setAddOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleDelete = (paymentId: string) => {
    startTransition(async () => {
      const result = await deletePayment(paymentId, bookingId);
      if (result.success) {
        toast.success("Payment removed.");
        setPaymentToDelete(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Totals summary */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 pb-4 border-b border-border">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Total
          </p>
          <p className="text-xl font-semibold tabular-nums mt-1">
            {formatCurrency(total)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Paid
          </p>
          <p className="text-xl font-semibold tabular-nums mt-1">
            {formatCurrency(paid)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Balance
          </p>
          <p
            className={cn(
              "text-xl font-semibold tabular-nums mt-1",
              balance > 0
                ? "text-destructive"
                : balance < 0
                ? "text-warning"
                : "text-success"
            )}
          >
            {formatCurrency(balance)}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      {canRecordPayments && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => openAddPayment(false)} disabled={isPending}>
            <Plus />
            Add payment
          </Button>
          {paid > 0 && (
            <Button
              variant="outline"
              onClick={() => openAddPayment(true)}
              disabled={isPending}
            >
              <Undo2 />
              Record refund
            </Button>
          )}
        </div>
      )}

      {/* Payment list */}
      {payments.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground border border-dashed rounded-md">
          No payments recorded yet.
        </div>
      ) : (
        <div className="divide-y divide-border border rounded-md">
          {payments.map((p) => {
            const isRefundEntry = Number(p.amount) < 0;
            const Icon = MODE_ICONS[p.mode];
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors"
              >
                <div
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                    isRefundEntry
                      ? "bg-warning/15 text-warning-foreground"
                      : "bg-success/15 text-success"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm tabular-nums">
                      {formatCurrency(Math.abs(Number(p.amount)))}
                    </span>
                    <Badge variant={isRefundEntry ? "warning" : "muted"} className="text-[10px]">
                      {isRefundEntry ? "Refund" : "Payment"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {MODE_LABELS[p.mode]}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                    <span>{formatDate(p.paid_at)}</span>
                    {p.reference_number && (
                      <span className="font-mono">Ref: {p.reference_number}</span>
                    )}
                    {p.notes && <span className="truncate">{p.notes}</span>}
                  </div>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setPaymentToDelete(p.id)}
                    disabled={isPending}
                    className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Delete payment"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add payment dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {isRefund ? (
                  <>
                    <Undo2 className="h-5 w-5 text-warning" />
                    Record refund
                  </>
                ) : (
                  <>
                    <IndianRupee className="h-5 w-5 text-primary" />
                    Add payment
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                {isRefund
                  ? "Refunds are stored as negative entries in the ledger."
                  : "Records a payment received from the guest."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (₹)</Label>
                  <Input
                    id="amount"
                    type="number"
                    min="0"
                    step="50"
                    value={amount || ""}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    placeholder="0"
                    autoFocus
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mode">Mode</Label>
                  <select
                    id="mode"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as PaymentMode)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="bank">Bank transfer</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reference">Reference number (optional)</Label>
                <Input
                  id="reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="UPI transaction ID, receipt number, etc."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="animate-spin" /> : null}
                {isRefund ? "Record refund" : "Record payment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={paymentToDelete !== null}
        onOpenChange={(open) => !open && setPaymentToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this payment entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the payment from the ledger. The
              booking&apos;s paid amount and balance will be recalculated. Use
              this only to correct mistakes — for actual refunds, record a
              refund instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => paymentToDelete && handleDelete(paymentToDelete)}
            >
              {isPending ? <Loader2 className="animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
