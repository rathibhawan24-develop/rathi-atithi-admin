"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type BookingFilters = {
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  view?: string;
};

type Props =
  | { type: "bookings"; filters?: BookingFilters }
  | { type: "guests"; filters?: { search?: string } };

// Client-side Excel export. Re-runs the same query the page is showing
// (no row limit this time) and turns it into an .xlsx file the browser
// downloads. Works for bookings (honours the active view/filters) and
// guests (honours the search).
export function ExcelDownload(props: Props) {
  const [busy, setBusy] = useState(false);

  const handleDownload = async () => {
    setBusy(true);
    try {
      const supabase = createClient();
      const today = new Date().toISOString().slice(0, 10);
      let rows: Record<string, unknown>[] = [];
      let filename = "";
      let sheetName = "";

      if (props.type === "bookings") {
        const filters = props.filters ?? {};
        let q = supabase
          .from("bookings")
          .select(
            "booking_code, guest_name, phone, email, check_in, check_out, nights, status, source, total_amount, paid_amount, balance, special_requests, created_at"
          )
          .order("created_at", { ascending: false });

        // Mirror the page's filter logic so the download = what they see.
        const view = filters.view;
        if (view === "checkins_today") {
          q = q.eq("check_in", today).in("status", ["confirmed", "pending"]);
        } else if (view === "checkouts_today") {
          q = q.eq("check_out", today).eq("status", "checked_in");
        } else if (view === "pending") {
          q = q.eq("status", "pending");
        } else if (view === "outstanding") {
          q = q.gt("balance", 0).in("status", ["confirmed", "checked_in"]);
        } else {
          if (filters.status) q = q.eq("status", filters.status);
          if (filters.from) q = q.gte("check_in", filters.from);
          if (filters.to) q = q.lte("check_in", filters.to);
        }
        if (filters.q && filters.q.trim()) {
          const term = filters.q.trim();
          q = q.or(
            `guest_name.ilike.%${term}%,phone.ilike.%${term}%,booking_code.ilike.%${term}%`
          );
        }

        const { data, error } = await q;
        if (error) throw error;
        rows = (data ?? []).map((b) => ({
          "Booking code": b.booking_code,
          "Guest name": b.guest_name,
          "Phone": b.phone,
          "Email": b.email,
          "Check-in": b.check_in,
          "Check-out": b.check_out,
          "Nights": b.nights,
          "Status": b.status,
          "Source": b.source,
          "Total (₹)": Number(b.total_amount),
          "Paid (₹)": Number(b.paid_amount),
          "Balance (₹)": Number(b.balance),
          "Special requests": b.special_requests ?? "",
          "Booked at": b.created_at,
        }));
        sheetName = "Bookings";
        filename = `bookings-${today}.xlsx`;
      } else {
        const filters = props.filters ?? {};
        let q = supabase
          .from("guests")
          .select("name, phone, email, total_bookings, last_booking_at, created_at")
          .order("last_booking_at", { ascending: false, nullsFirst: false });
        if (filters.search && filters.search.trim()) {
          const term = filters.search.trim();
          q = q.or(
            `name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`
          );
        }
        const { data, error } = await q;
        if (error) throw error;
        rows = (data ?? []).map((g) => ({
          "Name": g.name ?? "",
          "Phone": g.phone,
          "Email": g.email ?? "",
          "Total bookings": g.total_bookings,
          "Last booking": g.last_booking_at ?? "",
          "First seen": g.created_at,
        }));
        sheetName = "Guests";
        filename = `guests-${today}.xlsx`;
      }

      if (rows.length === 0) {
        toast.info("No rows to export with these filters.");
        return;
      }

      const sheet = XLSX.utils.json_to_sheet(rows);
      // Auto-size columns based on max content length per column
      const cols = Object.keys(rows[0]).map((key) => {
        const maxLen = Math.max(
          key.length,
          ...rows.map((r) => String(r[key] ?? "").length)
        );
        return { wch: Math.min(maxLen + 2, 40) };
      });
      sheet["!cols"] = cols;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, sheetName);
      XLSX.writeFile(wb, filename);
      toast.success(
        `Downloaded ${rows.length} ${props.type === "bookings" ? "booking" : "guest"}${rows.length === 1 ? "" : "s"}`
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Export failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleDownload}
      disabled={busy}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      Excel
    </Button>
  );
}
