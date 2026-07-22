"use client";

import { useState } from "react";
import { Receipt, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = { from: string; to: string; hasInvoices: boolean };

// Admin-only GST invoice export for the checked-out bookings in [from, to].
// Server route (/api/reports/export?type=invoices) enforces the admin check
// and does the GST math — this just triggers the download.
export function InvoiceExportButton({ from, to, hasInvoices }: Props) {
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    setBusy(true);
    try {
      const url = `/api/reports/export?type=invoices&from=${from}&to=${to}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const err = await res.text();
        alert(`Export failed: ${err}`);
        return;
      }
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `invoices_${from.replace(/-/g, "")}_${to.replace(/-/g, "")}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err) {
      alert(`Export failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="default"
      size="sm"
      onClick={handleExport}
      disabled={busy || to < from || !hasInvoices}
      title={!hasInvoices ? "No checked-out bookings in this range" : undefined}
      className="h-8 gap-1.5"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Receipt className="h-3.5 w-3.5" />
      )}
      Export invoices
    </Button>
  );
}
