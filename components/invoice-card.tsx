// components/invoice-card.tsx
"use client";

import { FileText, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InvoiceCard({ bookingCode }: { bookingCode: string }) {
  const url = `/api/invoice/${bookingCode}`;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-medium text-sm">Tax Receipt</h3>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        GST-compliant tax receipt with full booking breakdown, payment
        summary, amount in words, and CGST / SGST split. Generated fresh on
        every download.
      </p>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={url} target="_blank" rel="noopener">
            <ExternalLink className="h-3.5 w-3.5" />
            View
          </a>
        </Button>
        <Button asChild variant="default" size="sm">
          <a href={url} download={`Invoice-${bookingCode}.pdf`}>
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        </Button>
      </div>
    </div>
  );
}
