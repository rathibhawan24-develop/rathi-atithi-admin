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

// Date helpers — deterministic format, no locale dependency.
//
// Why not toLocaleDateString("en-IN", ...)?
//   Some Windows installations override the locale hint with the system date
//   format, producing MM-DD-YYYY for IN users. Building the string by hand
//   from getDate()/getMonth()/getFullYear() always renders the same way
//   regardless of browser, OS, or regional settings.

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Internal: parses ISO date strings ('YYYY-MM-DD') as LOCAL dates so the
 *  day doesn't shift across timezones. Full ISO timestamps fall through to
 *  the standard Date parser. */
function parseDate(input: string | Date): Date | null {
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  if (!input) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(date: string | Date): string {
  const d = parseDate(date);
  if (!d) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = MONTHS_SHORT[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

export function formatDateTime(date: string | Date): string {
  const d = parseDate(date);
  if (!d) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = MONTHS_SHORT[d.getMonth()];
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
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
