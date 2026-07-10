"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Calendar, ChevronDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Preset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "this_month"
  | "last_month"
  | "this_year"
  | "custom";

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function computePreset(preset: Preset): { from: string; to: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (preset) {
    case "today":
      return { from: ymd(today), to: ymd(today) };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: ymd(y), to: ymd(y) };
    }
    case "last7": {
      const f = new Date(today);
      f.setDate(f.getDate() - 6);
      return { from: ymd(f), to: ymd(today) };
    }
    case "last30": {
      const f = new Date(today);
      f.setDate(f.getDate() - 29);
      return { from: ymd(f), to: ymd(today) };
    }
    case "this_month": {
      const f = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: ymd(f), to: ymd(today) };
    }
    case "last_month": {
      const f = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const t = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: ymd(f), to: ymd(t) };
    }
    case "this_year": {
      const f = new Date(today.getFullYear(), 0, 1);
      return { from: ymd(f), to: ymd(today) };
    }
    default:
      return { from: ymd(today), to: ymd(today) };
  }
}

const PRESETS: { value: Preset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_year", label: "This year" },
];

type Props = { from: string; to: string };

export function DateFilter({ from, to }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [customOpen, setCustomOpen] = useState(false);
  const [fromInput, setFromInput] = useState(from);
  const [toInput, setToInput] = useState(to);

  useEffect(() => {
    setFromInput(from);
    setToInput(to);
  }, [from, to]);

  const applyRange = (newFrom: string, newTo: string) => {
    const params = new URLSearchParams(sp.toString());
    params.set("from", newFrom);
    params.set("to", newTo);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const basis = sp.get("basis") === "txn" ? "txn" : "stay";
  const applyBasis = (newBasis: "stay" | "txn") => {
    if (newBasis === basis) return;
    const params = new URLSearchParams(sp.toString());
    // "stay" is the default — keep the URL clean by omitting it.
    if (newBasis === "stay") params.delete("basis");
    else params.set("basis", newBasis);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  // Detect which preset matches the current range (if any)
  const activePreset: Preset | "custom" = (() => {
    for (const p of PRESETS) {
      const r = computePreset(p.value);
      if (r.from === from && r.to === to) return p.value;
    }
    return "custom";
  })();

  const BASIS_OPTIONS: { value: "stay" | "txn"; label: string }[] = [
    { value: "stay", label: "Stay dates" },
    { value: "txn", label: "Transaction dates" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Count by
        </span>
        <div
          role="group"
          aria-label="Date basis"
          className="inline-flex items-center rounded-md border border-border bg-muted p-0.5"
        >
          {BASIS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={isPending}
              aria-pressed={basis === o.value}
              onClick={() => applyBasis(o.value)}
              className={cn(
                "h-7 rounded-[5px] px-3 text-xs transition-colors disabled:opacity-60",
                basis === o.value
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <span
          className="inline-flex text-muted-foreground"
          title={
            "Stay dates: counts bookings, revenue and payments by when guests actually stay (stays overlapping your date range).\n" +
            "Transaction dates: counts bookings/revenue by when the booking was created and payments by when they were received."
          }
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">
            Stay dates count by when guests stay; transaction dates count by
            when bookings were created and payments received.
          </span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.value}
            type="button"
            variant={activePreset === p.value ? "default" : "outline"}
            size="sm"
            disabled={isPending}
            onClick={() => {
              const r = computePreset(p.value);
              applyRange(r.from, r.to);
            }}
            className="h-8 text-xs"
          >
            {p.label}
          </Button>
        ))}
        <Button
          type="button"
          variant={activePreset === "custom" ? "default" : "outline"}
          size="sm"
          disabled={isPending}
          onClick={() => setCustomOpen((o) => !o)}
          className="h-8 text-xs gap-1"
        >
          <Calendar className="h-3 w-3" />
          Custom
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform",
              customOpen && "rotate-180"
            )}
          />
        </Button>
      </div>

      {customOpen && (
        <div className="rounded-md border border-border bg-card p-3 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="rf_from" className="text-xs">
              From
            </Label>
            <Input
              id="rf_from"
              type="date"
              value={fromInput}
              max={toInput}
              onChange={(e) => setFromInput(e.target.value)}
              className="h-9 text-sm w-40"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rf_to" className="text-xs">
              To
            </Label>
            <Input
              id="rf_to"
              type="date"
              value={toInput}
              min={fromInput}
              onChange={(e) => setToInput(e.target.value)}
              className="h-9 text-sm w-40"
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => applyRange(fromInput, toInput)}
            disabled={isPending || !fromInput || !toInput || toInput < fromInput}
          >
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}
