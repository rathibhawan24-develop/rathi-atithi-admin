#!/usr/bin/env python3
"""
apply-invoice-feature.py
Adds GST-compliant tax receipt PDF generation to the Rathi Atithi admin app.

Creates (storage-free, generated on demand):
  - lib/number-to-words.ts                       Indian number-to-words
  - lib/invoice-pdf.tsx                          React-PDF document
  - app/api/invoice/[bookingCode]/route.tsx      API endpoint
  - components/invoice-card.tsx                  Admin download card
"""

from pathlib import Path
import sys

ROOT = Path.cwd()
if not (ROOT / "package.json").exists():
    print("\033[31m✗\033[0m Run from the admin project root (rathi-atithi-admin)")
    sys.exit(1)


NUMBER_TO_WORDS = '''// lib/number-to-words.ts
// Indian-numbering (lakh/crore) number-to-words. Used by invoice PDF.

export function numberToIndianWords(num: number): string {
  if (!Number.isFinite(num)) return "";
  if (num === 0) return "Zero Only";
  const negative = num < 0;
  num = Math.abs(num);

  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
  ];
  const teens = [
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  function below1000(n: number): string {
    let out = "";
    if (n >= 100) {
      out += ones[Math.floor(n / 100)] + " Hundred ";
      n %= 100;
    }
    if (n >= 20) {
      out += tens[Math.floor(n / 10)] + " ";
      n %= 10;
      if (n > 0) out += ones[n] + " ";
    } else if (n >= 10) {
      out += teens[n - 10] + " ";
    } else if (n > 0) {
      out += ones[n] + " ";
    }
    return out.trim();
  }

  const integer = Math.floor(num);
  const paise = Math.round((num - integer) * 100);

  let result = "";
  let n = integer;

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = n;

  if (crore > 0) result += below1000(crore) + " Crore ";
  if (lakh > 0) result += below1000(lakh) + " Lakh ";
  if (thousand > 0) result += below1000(thousand) + " Thousand ";
  if (hundred > 0) result += below1000(hundred);

  result = result.trim();
  if (paise > 0) result += " and " + below1000(paise) + " Paise";
  if (negative) result = "Negative " + result;

  return result + " Only";
}
'''


INVOICE_PDF = '''// lib/invoice-pdf.tsx
// GST-compliant tax receipt. Matches the legacy sample exactly:
// metadata header, hotel block, TAX RECEIPT title, Paid By, booking table,
// amount in words, payment summary, GST split, notes.

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { numberToIndianWords } from "./number-to-words";

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#111",
    lineHeight: 1.4,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  metaLeft: { flex: 1, textAlign: "left" },
  metaRight: { flex: 1, textAlign: "right" },
  gstinLine: {
    textAlign: "right",
    fontSize: 9,
    marginTop: 8,
    marginBottom: 4,
  },
  hotelBlock: {
    marginTop: 4,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  hotelName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  hotelSub: { fontSize: 8, color: "#444" },
  hotelContact: { fontSize: 8, color: "#444", marginTop: 2 },
  receiptTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 14,
    letterSpacing: 2,
  },
  sectionLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    color: "#222",
  },
  paidByBlock: { marginBottom: 14 },
  paidByName: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  table: { borderWidth: 0.5, borderColor: "#888", marginBottom: 8 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f0f0f0",
    borderBottomWidth: 0.5,
    borderBottomColor: "#888",
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontFamily: "Helvetica-Bold",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  tableRowTotal: {
    flexDirection: "row",
    backgroundColor: "#f7f7f7",
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontFamily: "Helvetica-Bold",
  },
  colDesc: { flex: 3 },
  colAmount: { flex: 1, textAlign: "right" },
  amountWordsBlock: { marginTop: 8, marginBottom: 12 },
  amountsBlock: {
    marginTop: 4,
    marginBottom: 12,
    alignSelf: "flex-end",
    width: "40%",
  },
  amountsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  amountsRowTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderTopWidth: 0.5,
    borderTopColor: "#333",
    borderBottomWidth: 0.5,
    borderBottomColor: "#333",
    fontFamily: "Helvetica-Bold",
    marginVertical: 2,
  },
  gstBlock: {
    marginTop: 8,
    marginBottom: 8,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: "#888",
  },
  notesBlock: { marginTop: 12, fontSize: 8, color: "#444" },
});

export type BookingForInvoice = {
  booking_code: string;
  guest_name: string;
  phone: string;
  email: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  paid_amount: number | string;
  balance: number | string;
  total_amount: number | string;
  rooms_subtotal: number | string;
  addons_subtotal: number | string;
  discount_amount: number | string | null;
  created_at: string;
  guest_city?: string | null;
  booking_rooms: Array<{
    rate_per_night: number | string;
    nights: number;
    guests: number;
    rooms: { room_number: string; room_type: string } | null;
  }>;
};

const HOTEL = {
  gstin: "09AAATR1176N1Z2",
  name: "Rathi Atithi Bhawan",
  legal: "(A unit of R B Hanmantram Ramnath Charitable Trust)",
  address: "Rang Ji East Gate, Gyan Gudri, Vrindavan",
  website: "www.rathiatithibhawan.org",
  email: "rathibhawan24@gmail.com",
  phones: "+91 82184 18154, 75000 49911",
};

function formatDate(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${days[dt.getDay()]}, ${months[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}

export function InvoicePDF({ booking }: { booking: BookingForInvoice }) {
  const today = new Date();
  const totalAmount = Number(booking.total_amount);
  const paidAmount = Number(booking.paid_amount);
  const balance = Number(booking.balance);
  const roomsSubtotal = Number(booking.rooms_subtotal);
  const addonsSubtotal = Number(booking.addons_subtotal);
  const discountAmount = Number(booking.discount_amount ?? 0);

  const totalGuests = booking.booking_rooms.reduce(
    (s, br) => s + (Number(br.guests) || 0),
    0
  );
  const numRooms = booking.booking_rooms.length;

  const roomNightsCount = booking.booking_rooms.reduce(
    (s, br) => s + (Number(br.nights) || 0),
    0
  );
  const avgRate = roomNightsCount > 0 ? roomsSubtotal / roomNightsCount : 0;

  // GST inclusive at 5% (CGST 2.5% + SGST 2.5%, same-state)
  const gstAmount = (totalAmount * 5) / 105;
  const cgst = gstAmount / 2;
  const sgst = gstAmount / 2;

  const receiptNo = `REC-${booking.booking_code.replace(/^RAB-?/i, "")}`;

  return (
    <Document
      title={`Tax Receipt ${booking.booking_code}`}
      author={HOTEL.name}
      subject="Tax Receipt"
    >
      <Page size="A4" style={styles.page}>
        {/* Metadata header — left/right columns */}
        <View style={styles.metaRow}>
          <Text style={styles.metaLeft}>
            Check-In: {formatDate(booking.check_in)}
          </Text>
          <Text style={styles.metaRight}>Receipt #: {receiptNo}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLeft}>
            Check-Out: {formatDate(booking.check_out)}
          </Text>
          <Text style={styles.metaRight}>
            Receipt Date: {formatDate(today)}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLeft}>
            Guests: {totalGuests} Adults, 0 Children
          </Text>
          <Text style={styles.metaRight}>
            Booking #: {booking.booking_code}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLeft}>No of Rooms: {numRooms}</Text>
          <Text style={styles.metaRight}>
            Booking Date: {formatDate(booking.created_at)}
          </Text>
        </View>

        <Text style={styles.gstinLine}>GSTIN : {HOTEL.gstin}</Text>

        {/* Hotel block */}
        <View style={styles.hotelBlock}>
          <Text style={styles.hotelName}>{HOTEL.name}</Text>
          <Text style={styles.hotelSub}>{HOTEL.legal}</Text>
          <Text style={styles.hotelContact}>
            {HOTEL.address}  ·  {HOTEL.website}
          </Text>
          <Text style={styles.hotelContact}>
            {HOTEL.email}  ·  {HOTEL.phones}
          </Text>
        </View>

        <Text style={styles.receiptTitle}>TAX RECEIPT</Text>

        {/* Paid By */}
        <View style={styles.paidByBlock}>
          <Text style={styles.sectionLabel}>Paid By</Text>
          <Text style={styles.paidByName}>{booking.guest_name}</Text>
          {booking.guest_city ? <Text>{booking.guest_city}</Text> : null}
          <Text>{booking.phone}</Text>
          {booking.email ? <Text>{booking.email}</Text> : null}
        </View>

        {/* Booking Details */}
        <Text style={styles.sectionLabel}>Booking Details</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDesc}>Description</Text>
            <Text style={styles.colAmount}>Amount</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.colDesc}>
              {roomNightsCount} X Rooms ({fmt(avgRate)})
            </Text>
            <Text style={styles.colAmount}>{fmt(roomsSubtotal)}</Text>
          </View>
          {addonsSubtotal > 0 ? (
            <View style={styles.tableRow}>
              <Text style={styles.colDesc}>Add-ons</Text>
              <Text style={styles.colAmount}>{fmt(addonsSubtotal)}</Text>
            </View>
          ) : null}
          <View style={styles.tableRow}>
            <Text style={styles.colDesc}>Discount</Text>
            <Text style={styles.colAmount}>-{fmt(discountAmount)}</Text>
          </View>
          <View style={styles.tableRowTotal}>
            <Text style={styles.colDesc}>Total</Text>
            <Text style={styles.colAmount}>{fmt(totalAmount)}</Text>
          </View>
        </View>

        {/* Amount in Words */}
        <View style={styles.amountWordsBlock}>
          <Text style={styles.sectionLabel}>Amount in Words</Text>
          <Text>{numberToIndianWords(totalAmount)}</Text>
        </View>

        {/* Payment summary */}
        <View style={styles.amountsBlock}>
          <View style={styles.amountsRow}>
            <Text>Old Payment</Text>
            <Text>{fmtInt(0)}</Text>
          </View>
          <View style={styles.amountsRow}>
            <Text>Paid Amount</Text>
            <Text>{fmtInt(paidAmount)}</Text>
          </View>
          <View style={styles.amountsRowTotal}>
            <Text>Net Payable</Text>
            <Text>{fmtInt(totalAmount)}</Text>
          </View>
          <View style={styles.amountsRow}>
            <Text>O/s Balance</Text>
            <Text>{fmtInt(balance)}</Text>
          </View>
        </View>

        {/* GST split */}
        <View style={styles.gstBlock}>
          <Text>
            GST @ 5% (inclusive) : CGST: {fmt(cgst)}; SGST: {fmt(sgst)};
          </Text>
        </View>

        {/* Notes */}
        <View style={styles.notesBlock}>
          <Text style={styles.sectionLabel}>Note(s) :</Text>
          <Text>
            Thank you for visiting with us. We look forward to your next visit.
          </Text>
          <Text>{"\\n"}Radhe Radhe</Text>
        </View>
      </Page>
    </Document>
  );
}
'''


ROUTE_TSX = '''// app/api/invoice/[bookingCode]/route.tsx
// Generates a fresh PDF on every request. No storage involved.
// Public endpoint so WhatsApp / email links also work; booking_code itself
// gates access (6+ char hash, not enumerable).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoicePDF, type BookingForInvoice } from "@/lib/invoice-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bookingCode: string }> }
) {
  const { bookingCode } = await params;

  if (!/^[A-Z0-9-]{6,20}$/i.test(bookingCode)) {
    return new NextResponse("Invalid booking code", { status: 400 });
  }

  const { data: booking, error } = await supabase
    .from("bookings")
    .select(
      `
      booking_code, guest_name, phone, email,
      check_in, check_out, nights,
      paid_amount, balance, total_amount,
      rooms_subtotal, addons_subtotal, discount_amount,
      created_at,
      booking_rooms (
        rate_per_night, nights, guests,
        rooms ( room_number, room_type )
      )
    `
    )
    .eq("booking_code", bookingCode)
    .single();

  if (error || !booking) {
    return new NextResponse("Booking not found", { status: 404 });
  }

  try {
    const buffer = await renderToBuffer(
      <InvoicePDF booking={booking as unknown as BookingForInvoice} />
    );

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Invoice-${bookingCode}.pdf"`,
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch (e) {
    console.error("PDF generation failed", e);
    return new NextResponse("PDF generation failed", { status: 500 });
  }
}
'''


INVOICE_CARD = '''// components/invoice-card.tsx
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
'''


FILES = {
    "lib/number-to-words.ts": NUMBER_TO_WORDS,
    "lib/invoice-pdf.tsx": INVOICE_PDF,
    "app/api/invoice/[bookingCode]/route.tsx": ROUTE_TSX,
    "components/invoice-card.tsx": INVOICE_CARD,
}


for path_str, content in FILES.items():
    p = ROOT / path_str
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.exists():
        print(f"\033[33m-\033[0m {path_str} (exists, skipped)")
    else:
        p.write_text(content, encoding="utf-8")
        print(f"\033[32m✓\033[0m {path_str}")

print()
print("Next steps:")
print("  1. npm install @react-pdf/renderer")
print("  2. Add to app/(dashboard)/bookings/[id]/page.tsx:")
print('       import { InvoiceCard } from "@/components/invoice-card";')
print("     and render below NotificationsCard:")
print("       <InvoiceCard bookingCode={booking.booking_code} />")
print("  3. npm run build")
