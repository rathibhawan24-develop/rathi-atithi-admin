import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: string = "₹"): string {
  // Manual Indian grouping (xx,xx,xxx) instead of relying on toLocaleString,
  // because some Windows browsers ignore the en-IN locale hint and fall back
  // to en-US grouping. This is the same root cause as the date-format bug.
  if (amount == null || isNaN(amount)) return `${currency}0`;
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const [intPart, decPart] = abs.toFixed(2).split(".");
  // Indian system: last 3 digits, then groups of 2
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const grouped =
    rest.length > 0
      ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3
      : last3;
  const trimmed = decPart === "00" ? grouped : `${grouped}.${decPart}`;
  return `${sign}${currency}${trimmed}`;
}

// Date helpers — always render in IST (Asia/Kolkata), independent of the
// runtime timezone AND of the browser/OS locale.
//
// Two problems this guards against:
//   1. Timezone. Our DB stores timestamps in UTC. Vercel's servers run in UTC,
//      so a server component that reads the wall-clock via getHours()/getDate()
//      shows UTC, while the same code in the browser (IST) shows IST — the two
//      disagree. We pin every instant to Asia/Kolkata via Intl.DateTimeFormat
//      so server and client render identically, always in IST.
//   2. Locale. Some Windows installs ignore the "en-IN" hint and reorder the
//      fields (MM-DD-YYYY) or grouping. We never emit locale-formatted strings;
//      we pull numeric parts and assemble the string by hand.
//
// A pure calendar date ('YYYY-MM-DD' — check-in/check-out) is NOT an instant:
// it is a wall date with no time or zone, so it must be rendered verbatim and
// must NOT be timezone-shifted (that would move it a day near midnight).

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const IST_TIME_ZONE = "Asia/Kolkata";

/** Matches a pure calendar date with no time component. */
function isDateOnly(input: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(input);
}

/** The IST wall-clock components of an instant. Uses Intl with an explicit
 *  timeZone, so the result is the same on a UTC server and an IST browser. */
function istParts(instant: Date): {
  day: number;
  month: number; // 1-12
  year: number;
  hour: number; // 0-23
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    day: get("day"),
    month: get("month"),
    year: get("year"),
    // hour12:false emits "24" for midnight on some engines; normalise to 0.
    hour: get("hour") % 24,
    minute: get("minute"),
  };
}

/** Resolves display input to either a pinned calendar date or an IST instant.
 *  Returns null for empty/invalid input. */
function resolve(
  date: string | Date
): { dateOnly: { day: number; month: number; year: number } } | { ist: ReturnType<typeof istParts> } | null {
  if (typeof date === "string") {
    if (!date) return null;
    if (isDateOnly(date)) {
      const [y, m, d] = date.split("-").map(Number);
      return { dateOnly: { day: d, month: m, year: y } };
    }
    const parsed = new Date(date);
    return isNaN(parsed.getTime()) ? null : { ist: istParts(parsed) };
  }
  return isNaN(date.getTime()) ? null : { ist: istParts(date) };
}

/** "13 Jul 2026". Calendar dates render verbatim; instants render in IST. */
export function formatDate(date: string | Date): string {
  const r = resolve(date);
  if (!r) return "";
  const { day, month, year } = "dateOnly" in r ? r.dateOnly : r.ist;
  return `${String(day).padStart(2, "0")} ${MONTHS_SHORT[month - 1]} ${year}`;
}

/** "13 Jul 2026, 3:27 pm" in IST. A time-of-day only makes sense for an
 *  instant, so a bare calendar date is treated as IST midnight. */
export function formatDateTime(date: string | Date): string {
  const r = resolve(date);
  if (!r) return "";
  if ("dateOnly" in r) {
    const { day, month, year } = r.dateOnly;
    return `${String(day).padStart(2, "0")} ${MONTHS_SHORT[month - 1]} ${year}, 12:00 am`;
  }
  const { day, month, year, hour, minute } = r.ist;
  const ampm = hour >= 12 ? "pm" : "am";
  let h = hour % 12;
  if (h === 0) h = 12;
  return `${String(day).padStart(2, "0")} ${MONTHS_SHORT[month - 1]} ${year}, ${h}:${String(minute).padStart(2, "0")} ${ampm}`;
}

/** "13 Jul, 15:27" in IST — compact, 24-hour, no year. For dense logs
 *  (e.g. the notification timeline) where the year is redundant. */
export function formatDateTimeShort(date: string | Date): string {
  const r = resolve(date);
  if (!r) return "";
  const { day, month, hour, minute } =
    "dateOnly" in r ? { ...r.dateOnly, hour: 0, minute: 0 } : r.ist;
  return `${day} ${MONTHS_SHORT[month - 1]}, ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// ID proof (Aadhaar / PAN / DL / Voter ID …) — display helpers.
// Same type codes as the booking ID-proof editor (id-proof-section.tsx).

const ID_PROOF_TYPE_LABELS: Record<string, string> = {
  aadhaar: "Aadhaar",
  passport: "Passport",
  driving_license: "Driving License",
  voter_id: "Voter ID",
  other: "Other",
};

export function idProofTypeLabel(type: string | null | undefined): string {
  if (!type) return "";
  return ID_PROOF_TYPE_LABELS[type] ?? type;
}

/**
 * Mask an ID number so only the LAST 4 characters are visible, grouped in
 * fours from the right (e.g. Aadhaar "1234 5678 9012" -> "XXXX XXXX 9012",
 * PAN "ABCDE1234F" -> "XX XXXX 234F"). Returns null for empty input.
 *
 * PII: we NEVER surface a full ID number anywhere in the app or exports. This
 * is the single choke point — display and Excel both go through here.
 */
export function maskIdNumber(raw: string | null | undefined): string | null {
  const s = (raw ?? "").replace(/\s+/g, "").trim();
  if (!s) return null;
  const revealed =
    s.length <= 4 ? s : "X".repeat(s.length - 4) + s.slice(-4);
  const groups: string[] = [];
  for (let i = revealed.length; i > 0; i -= 4) {
    groups.unshift(revealed.slice(Math.max(0, i - 4), i));
  }
  return groups.join(" ");
}

/** "Aadhaar · XXXX XXXX 9012", or "—" when there is no ID number. */
export function formatMaskedIdProof(
  type: string | null | undefined,
  number: string | null | undefined
): string {
  const masked = maskIdNumber(number);
  if (!masked) return "—";
  const label = idProofTypeLabel(type) || "ID";
  return `${label} · ${masked}`;
}
