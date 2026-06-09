"use client";

import { useState } from "react";
import { Download, ChevronDown, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ExportType = "bookings" | "payments" | "outstanding";

const OPTIONS: { value: ExportType; label: string }[] = [
  { value: "bookings", label: "Bookings (CSV)" },
  { value: "payments", label: "Payments (CSV)" },
  { value: "outstanding", label: "Outstanding balances (CSV)" },
];

type Props = { from: string; to: string };

export function ExportButtons({ from, to }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportType | null>(null);

  const handleExport = async (type: ExportType) => {
    setBusy(type);
    setOpen(false);
    try {
      const url = `/api/reports/export?type=${type}&from=${from}&to=${to}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const err = await res.text();
        alert(`Export failed: ${err}`);
        return;
      }
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `rathi-${type}-${from}-to-${to}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err) {
      alert(`Export failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        disabled={busy !== null}
        className="h-8 gap-1.5"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        Export
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
        />
      </Button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 top-full mt-1 w-56 rounded-md border border-border bg-card shadow-lg z-20 overflow-hidden">
            {OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => handleExport(o.value)}
                className="w-full px-3 py-2.5 text-sm text-left hover:bg-muted/60 transition-colors flex items-center gap-2"
              >
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
