#!/usr/bin/env python3
"""
apply-invoice-v2.py
Rewrites the tax receipt PDF with:
  - One line per room (#, name, nights, rate, amount)
  - Discount line with type / percent shown when applicable
  - Itemized payment record with mode + date
  - Brand-aligned warm Vrindavan amber theme
  - Cleaner spacing, no more clipped right-column values

Patches three files:
  - lib/invoice-pdf.tsx           (complete rewrite)
  - app/api/invoice/[bookingCode]/route.tsx  (SELECT extras)
  - lib/send-booking-email.ts     (SELECT extras for email attachment)
"""

from pathlib import Path
import sys

ROOT = Path.cwd()
if not (ROOT / "package.json").exists():
    print("\033[31m✗\033[0m Run from project root")
    sys.exit(1)


NEW_PDF = r'''// lib/invoice-pdf.tsx
// Brand-aligned tax receipt PDF. Itemized by room, with full payment record.

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { numberToIndianWords } from "./number-to-words";

// Warm Vrindavan amber theme — matches the customer site
const COLORS = {
  brand: "#c2410c",
  brandLightest: "#fff7ed",
  ink: "#1c1917",
  inkSoft: "#57534e",
  divider: "#e7e5e4",
  background: "#fafaf9",
  success: "#16a34a",
  warning: "#a16207",
  warningBg: "#fef3c7",
};

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: COLORS.ink,
    lineHeight: 1.5,
  },

  // Meta header
  metaTable: { marginBottom: 4 },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  metaLeft: { flex: 1, fontSize: 9, color: COLORS.inkSoft },
  metaRight: {
    flex: 1,
    fontSize: 9,
    color: COLORS.inkSoft,
    textAlign: "right",
  },
  metaValue: { color: COLORS.ink, fontFamily: "Helvetica-Bold" },
  gstinLine: {
    textAlign: "right",
    fontSize: 8.5,
    color: COLORS.inkSoft,
    marginBottom: 10,
  },

  // Hotel header — brand bar
  hotelBlock: {
    backgroundColor: COLORS.brandLightest,
    padding: 14,
    paddingLeft: 18,
    borderRadius: 4,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.brand,
    marginBottom: 16,
  },
  hotelName: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: COLORS.brand,
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  hotelSub: { fontSize: 8.5, color: COLORS.inkSoft, marginTop: 2 },
  hotelContact: { fontSize: 8.5, color: COLORS.inkSoft, marginTop: 3 },

  // Title
  receiptTitle: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 16,
    letterSpacing: 6,
    color: COLORS.brand,
  },

  // Section labels
  sectionLabel: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: COLORS.inkSoft,
    letterSpacing: 1.5,
    marginBottom: 6,
  },

  paidByBlock: { marginBottom: 18 },
  paidByName: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: COLORS.ink,
    marginBottom: 2,
  },
  paidByDetail: { color: COLORS.inkSoft, fontSize: 9 },

  // Item table
  table: { marginBottom: 6 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.brand,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tableHeaderText: {
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.divider,
    paddingVertical: 9,
    paddingHorizontal: 10,
    alignItems: "flex-start",
  },
  tableRowAlt: {
    backgroundColor: COLORS.background,
  },

  colDesc: { flex: 4 },
  colQty: { flex: 1.5, textAlign: "center", color: COLORS.inkSoft },
  colRate: { flex: 1.5, textAlign: "right", color: COLORS.inkSoft },
  colAmount: { flex: 1.5, textAlign: "right", fontFamily: "Helvetica-Bold" },

  itemTitle: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  itemSub: { fontSize: 8, color: COLORS.inkSoft, marginTop: 2 },

  // Totals
  subTotalRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.divider,
  },
  subTotalLabel: {
    flex: 7,
    textAlign: "right",
    color: COLORS.inkSoft,
    fontSize: 9,
  },
  subTotalValue: { flex: 1.5, textAlign: "right", fontSize: 9 },

  discountRow: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: COLORS.warningBg,
  },
  discountLabel: {
    flex: 7,
    textAlign: "right",
    color: COLORS.warning,
    fontSize: 9,
  },
  discountValue: {
    flex: 1.5,
    textAlign: "right",
    color: COLORS.warning,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },

  totalRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: COLORS.brand,
    marginTop: 2,
  },
  totalLabel: {
    flex: 7,
    textAlign: "right",
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  totalValue: {
    flex: 1.5,
    textAlign: "right",
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
  },

  // Amount in words
  amountWordsBlock: {
    marginTop: 16,
    marginBottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: COLORS.brandLightest,
    borderRadius: 3,
  },
  amountWordsLabel: {
    fontSize: 7.5,
    color: COLORS.inkSoft,
    letterSpacing: 1.5,
    marginBottom: 4,
    fontFamily: "Helvetica-Bold",
  },
  amountWordsText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: COLORS.brand,
  },

  // Payment record
  paymentBlock: { marginBottom: 14 },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.divider,
    alignItems: "center",
  },
  paymentLeft: { flexDirection: "column" },
  paymentDate: { color: COLORS.ink, fontSize: 9, fontFamily: "Helvetica-Bold" },
  paymentMode: { color: COLORS.inkSoft, fontSize: 8, marginTop: 1 },
  paymentValue: { fontFamily: "Helvetica-Bold", fontSize: 10, color: COLORS.success },
  refundValue: { fontFamily: "Helvetica-Bold", fontSize: 10, color: COLORS.warning },

  paymentTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: COLORS.background,
    marginTop: 4,
    borderRadius: 3,
    alignItems: "center",
  },
  paymentTotalLabel: { fontFamily: "Helvetica-Bold", fontSize: 10 },

  // GST
  gstBlock: {
    marginTop: 10,
    marginBottom: 14,
    padding: 10,
    backgroundColor: COLORS.background,
    borderRadius: 3,
  },
  gstLabel: {
    fontSize: 7.5,
    color: COLORS.inkSoft,
    letterSpacing: 1.5,
    marginBottom: 4,
    fontFamily: "Helvetica-Bold",
  },

  // Footer
  notesBlock: {
    marginTop: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.brand,
    textAlign: "center",
  },
  thankYou: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: COLORS.brand,
    marginBottom: 3,
  },
  thankYouSub: { fontSize: 9, color: COLORS.inkSoft },
  radheRadhe: {
    fontSize: 13,
    color: COLORS.brand,
    fontFamily: "Helvetica-Bold",
    marginTop: 12,
    letterSpacing: 1,
  },
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
  discount_type?: "none" | "percent" | "amount" | string | null;
  discount_value?: number | string | null;
  discount_amount: number | string | null;
  created_at: string;
  guest_city?: string | null;
  booking_rooms: Array<{
    rate_per_night: number | string;
    nights: number;
    guests: number;
    rooms: {
      room_number: string;
      room_type: string;
      name?: string | null;
    } | null;
  }>;
  payments?: Array<{
    amount: number | string;
    mode?: string | null;
    paid_at?: string | null;
  }> | null;
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
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[dt.getDay()]}, ${months[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
}

function formatShortDate(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
}

function formatMode(m?: string | null): string {
  if (!m) return "Payment";
  const k = m.toLowerCase();
  if (k === "upi") return "UPI";
  if (k === "cash") return "Cash";
  if (k === "bank") return "Bank Transfer";
  if (k === "card") return "Card";
  if (k === "cheque") return "Cheque";
  return m.charAt(0).toUpperCase() + m.slice(1);
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function InvoicePDF({ booking }: { booking: BookingForInvoice }) {
  const today = new Date();
  const totalAmount = Number(booking.total_amount);
  const roomsSubtotal = Number(booking.rooms_subtotal);
  const addonsSubtotal = Number(booking.addons_subtotal);
  const discountAmount = Number(booking.discount_amount ?? 0);
  const discountType = booking.discount_type ?? "none";
  const discountValue = Number(booking.discount_value ?? 0);

  // Live payment computation — sums from the payments table, source of truth
  const paymentsArr = (booking.payments ?? []) as Array<{
    amount: number | string;
    mode?: string | null;
    paid_at?: string | null;
  }>;
  const paidAmount =
    paymentsArr.length > 0
      ? paymentsArr.reduce((s, p) => s + Number(p.amount || 0), 0)
      : Number(booking.paid_amount);
  const balance = totalAmount - paidAmount;

  const totalGuests = booking.booking_rooms.reduce(
    (s, br) => s + (Number(br.guests) || 0),
    0
  );
  const numRooms = booking.booking_rooms.length;

  // GST inclusive at 5% — CGST + SGST split (same-state UP)
  const gstAmount = (totalAmount * 5) / 105;
  const cgst = gstAmount / 2;
  const sgst = gstAmount / 2;

  const receiptNo = `REC-${booking.booking_code.replace(/^RAB-?/i, "")}`;

  // Sort payments chronologically
  const sortedPayments = [...paymentsArr].sort((a, b) => {
    const da = a.paid_at ? new Date(a.paid_at).getTime() : 0;
    const db = b.paid_at ? new Date(b.paid_at).getTime() : 0;
    return da - db;
  });

  return (
    <Document
      title={`Tax Receipt ${booking.booking_code}`}
      author={HOTEL.name}
      subject="Tax Receipt"
    >
      <Page size="A4" style={styles.page}>
        {/* Metadata header */}
        <View style={styles.metaTable}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLeft}>
              Check-In:{" "}
              <Text style={styles.metaValue}>
                {formatDate(booking.check_in)}
              </Text>
            </Text>
            <Text style={styles.metaRight}>
              Receipt #: <Text style={styles.metaValue}>{receiptNo}</Text>
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLeft}>
              Check-Out:{" "}
              <Text style={styles.metaValue}>
                {formatDate(booking.check_out)}
              </Text>
            </Text>
            <Text style={styles.metaRight}>
              Receipt Date:{" "}
              <Text style={styles.metaValue}>{formatDate(today)}</Text>
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLeft}>
              Guests: <Text style={styles.metaValue}>{totalGuests}</Text>
            </Text>
            <Text style={styles.metaRight}>
              Booking #:{" "}
              <Text style={styles.metaValue}>{booking.booking_code}</Text>
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLeft}>
              No of Rooms: <Text style={styles.metaValue}>{numRooms}</Text>
            </Text>
            <Text style={styles.metaRight}>
              Booking Date:{" "}
              <Text style={styles.metaValue}>
                {formatDate(booking.created_at)}
              </Text>
            </Text>
          </View>
        </View>

        <Text style={styles.gstinLine}>GSTIN: {HOTEL.gstin}</Text>

        {/* Hotel brand block */}
        <View style={styles.hotelBlock}>
          <Text style={styles.hotelName}>{HOTEL.name}</Text>
          <Text style={styles.hotelSub}>{HOTEL.legal}</Text>
          <Text style={styles.hotelContact}>{HOTEL.address}</Text>
          <Text style={styles.hotelContact}>
            {HOTEL.email}  ·  {HOTEL.phones}  ·  {HOTEL.website}
          </Text>
        </View>

        <Text style={styles.receiptTitle}>TAX RECEIPT</Text>

        {/* Billed To */}
        <View style={styles.paidByBlock}>
          <Text style={styles.sectionLabel}>BILLED TO</Text>
          <Text style={styles.paidByName}>{booking.guest_name}</Text>
          {booking.guest_city ? (
            <Text style={styles.paidByDetail}>{booking.guest_city}</Text>
          ) : null}
          <Text style={styles.paidByDetail}>{booking.phone}</Text>
          {booking.email ? (
            <Text style={styles.paidByDetail}>{booking.email}</Text>
          ) : null}
        </View>

        {/* Itemized table */}
        <Text style={styles.sectionLabel}>BOOKING DETAILS</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.colDesc, styles.tableHeaderText]}>
              Description
            </Text>
            <Text style={[styles.colQty, styles.tableHeaderText]}>Qty</Text>
            <Text style={[styles.colRate, styles.tableHeaderText]}>
              Rate
            </Text>
            <Text style={[styles.colAmount, styles.tableHeaderText]}>
              Amount
            </Text>
          </View>

          {/* One line per room */}
          {booking.booking_rooms.map((br, idx) => {
            const rate = Number(br.rate_per_night);
            const nights = Number(br.nights);
            const lineTotal = rate * nights;
            const displayName =
              br.rooms?.name ?? br.rooms?.room_type ?? "Room";
            return (
              <View
                key={idx}
                style={[
                  styles.tableRow,
                  idx % 2 === 1 ? styles.tableRowAlt : {},
                ]}
              >
                <View style={styles.colDesc}>
                  <Text style={styles.itemTitle}>
                    Room #{br.rooms?.room_number ?? "—"}  ·  {displayName}
                  </Text>
                  <Text style={styles.itemSub}>
                    {br.guests} {br.guests === 1 ? "guest" : "guests"}
                  </Text>
                </View>
                <Text style={styles.colQty}>
                  {nights} {nights === 1 ? "night" : "nights"}
                </Text>
                <Text style={styles.colRate}>₹ {fmt(rate)}</Text>
                <Text style={styles.colAmount}>₹ {fmt(lineTotal)}</Text>
              </View>
            );
          })}

          {/* Add-ons aggregate (if present) */}
          {addonsSubtotal > 0 ? (
            <View
              style={[
                styles.tableRow,
                booking.booking_rooms.length % 2 === 1
                  ? styles.tableRowAlt
                  : {},
              ]}
            >
              <View style={styles.colDesc}>
                <Text style={styles.itemTitle}>Add-ons &amp; Extras</Text>
                <Text style={styles.itemSub}>
                  Extra beds, services, and additional items
                </Text>
              </View>
              <Text style={styles.colQty}>—</Text>
              <Text style={styles.colRate}>—</Text>
              <Text style={styles.colAmount}>₹ {fmt(addonsSubtotal)}</Text>
            </View>
          ) : null}

          {/* Sub-total */}
          <View style={styles.subTotalRow}>
            <Text style={styles.subTotalLabel}>Sub-total</Text>
            <Text style={styles.subTotalValue}>
              ₹ {fmt(roomsSubtotal + addonsSubtotal)}
            </Text>
          </View>

          {/* Discount line if any */}
          {discountAmount > 0 ? (
            <View style={styles.discountRow}>
              <Text style={styles.discountLabel}>
                Discount
                {discountType === "percent" && discountValue > 0
                  ? ` (${discountValue}%)`
                  : ""}
              </Text>
              <Text style={styles.discountValue}>- ₹ {fmt(discountAmount)}</Text>
            </View>
          ) : null}

          {/* Grand total */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL AMOUNT</Text>
            <Text style={styles.totalValue}>₹ {fmt(totalAmount)}</Text>
          </View>
        </View>

        {/* Amount in words */}
        <View style={styles.amountWordsBlock}>
          <Text style={styles.amountWordsLabel}>AMOUNT IN WORDS</Text>
          <Text style={styles.amountWordsText}>
            {numberToIndianWords(totalAmount)}
          </Text>
        </View>

        {/* Payment record */}
        <Text style={styles.sectionLabel}>PAYMENT RECORD</Text>
        <View style={styles.paymentBlock}>
          {sortedPayments.length > 0 ? (
            sortedPayments.map((p, idx) => {
              const amt = Number(p.amount || 0);
              const isRefund = amt < 0;
              return (
                <View key={idx} style={styles.paymentRow}>
                  <View style={styles.paymentLeft}>
                    <Text style={styles.paymentDate}>
                      {p.paid_at ? formatShortDate(p.paid_at) : "Payment"}
                    </Text>
                    <Text style={styles.paymentMode}>
                      {isRefund ? "Refund" : "Payment"}  ·  {formatMode(p.mode)}
                    </Text>
                  </View>
                  <Text
                    style={isRefund ? styles.refundValue : styles.paymentValue}
                  >
                    {isRefund ? "- " : ""}₹ {fmt(Math.abs(amt))}
                  </Text>
                </View>
              );
            })
          ) : (
            <View style={styles.paymentRow}>
              <Text style={styles.paymentMode}>No payments recorded yet</Text>
              <Text style={styles.paymentMode}>—</Text>
            </View>
          )}

          <View style={styles.paymentTotal}>
            <Text style={styles.paymentTotalLabel}>Total Paid</Text>
            <Text
              style={{
                fontFamily: "Helvetica-Bold",
                fontSize: 11,
                color: COLORS.success,
              }}
            >
              ₹ {fmt(paidAmount)}
            </Text>
          </View>
          <View style={styles.paymentTotal}>
            <Text style={styles.paymentTotalLabel}>Balance Due</Text>
            <Text
              style={{
                fontFamily: "Helvetica-Bold",
                fontSize: 11,
                color: balance > 0 ? COLORS.warning : COLORS.success,
              }}
            >
              ₹ {fmt(balance)}
            </Text>
          </View>
        </View>

        {/* GST split */}
        <View style={styles.gstBlock}>
          <Text style={styles.gstLabel}>TAX SUMMARY</Text>
          <Text>
            GST @ 5% (inclusive) on ₹{fmt(totalAmount)}:  CGST 2.5% = ₹
            {fmt(cgst)}  ·  SGST 2.5% = ₹{fmt(sgst)}
          </Text>
        </View>

        {/* Notes / signature */}
        <View style={styles.notesBlock}>
          <Text style={styles.thankYou}>
            Thank you for visiting with us.
          </Text>
          <Text style={styles.thankYouSub}>
            We look forward to your next visit.
          </Text>
          <Text style={styles.radheRadhe}>Radhe Radhe</Text>
        </View>
      </Page>
    </Document>
  );
}
'''


# ============================================================================
# 1. Rewrite lib/invoice-pdf.tsx
# ============================================================================
print("→ lib/invoice-pdf.tsx")
p1 = ROOT / "lib/invoice-pdf.tsx"
p1.write_text(NEW_PDF, encoding="utf-8")
print("  \033[32m✓\033[0m Rewrote with itemized layout + brand theme")


# ============================================================================
# 2. Patch app/api/invoice/[bookingCode]/route.tsx
# ============================================================================
print("\n→ app/api/invoice/[bookingCode]/route.tsx")
p2 = ROOT / "app/api/invoice/[bookingCode]/route.tsx"
s = p2.read_text(encoding="utf-8")

old_route_select = """      booking_code, guest_name, phone, email,
      check_in, check_out, nights,
      paid_amount, balance, total_amount,
      rooms_subtotal, addons_subtotal, discount_amount,
      created_at,
      booking_rooms (
        rate_per_night, nights, guests,
        rooms ( room_number, room_type )
      ),
      payments ( amount, mode )"""

new_route_select = """      booking_code, guest_name, phone, email,
      check_in, check_out, nights,
      paid_amount, balance, total_amount,
      rooms_subtotal, addons_subtotal,
      discount_type, discount_value, discount_amount,
      created_at,
      booking_rooms (
        rate_per_night, nights, guests,
        rooms ( room_number, room_type, name )
      ),
      payments ( amount, mode, paid_at )"""

if "discount_type, discount_value, discount_amount" in s and "room_type, name" in s:
    print("  \033[90m-\033[0m SELECT already extended")
elif old_route_select in s:
    s = s.replace(old_route_select, new_route_select)
    p2.write_text(s, encoding="utf-8")
    print("  \033[32m✓\033[0m Added discount fields, room name, paid_at")
else:
    print("  \033[31m✗\033[0m Could not match route SELECT — manual update needed")


# ============================================================================
# 3. Patch lib/send-booking-email.ts (just the rooms + payments select bits)
# ============================================================================
print("\n→ lib/send-booking-email.ts")
p3 = ROOT / "lib/send-booking-email.ts"
s = p3.read_text(encoding="utf-8")

old_rooms = """      booking_rooms (
        rate_per_night, nights, guests,
        rooms ( room_number, room_type )
      ),
      payments ( amount, mode )"""
new_rooms = """      booking_rooms (
        rate_per_night, nights, guests,
        rooms ( room_number, room_type, name )
      ),
      payments ( amount, mode, paid_at )"""

if "room_type, name" in s and "amount, mode, paid_at" in s:
    print("  \033[90m-\033[0m Email SELECT already extended")
elif old_rooms in s:
    s = s.replace(old_rooms, new_rooms)
    p3.write_text(s, encoding="utf-8")
    print("  \033[32m✓\033[0m Added room name + paid_at to email SELECT")
else:
    print("  \033[31m✗\033[0m Could not match email SELECT — manual update needed")


print("\n\033[32mDone.\033[0m Run `npm run build` to verify.")
