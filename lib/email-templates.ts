// Branded transactional email templates for Rathi Atithi Bhawan.
// All HTML is inline-styled (no <style> tags or external CSS) so Gmail/Outlook
// render it correctly. Layout uses tables (not flexbox) for the same reason.
// Designed to match the customer site's cream + amber + Fraunces aesthetic.

export type EmailStage = "received" | "confirmed" | "checked_in" | "checked_out";

export type BookingForEmail = {
  booking_code: string;
  guest_name: string;
  email: string | null;
  phone: string;
  check_in: string; // 'YYYY-MM-DD'
  check_out: string;
  nights: number;
  total_amount: number;
  paid_amount: number;
  balance: number;
  rooms: { room_number: string; room_type: string }[];
};

// ---------- Brand tokens (kept here so we can tweak the look in one place) ----------
const BRAND = {
  cream: "#FAF3E7",
  white: "#FFFFFF",
  primary: "#B45309", // amber-700
  primaryDeep: "#92400E", // amber-800
  primarySoft: "#FEF3C7", // amber-100
  accent: "#FED7AA", // amber-200
  ink: "#3F2D1A",
  text: "#4B3621",
  muted: "#8B6F47",
  border: "#E8D9B9",
  success: "#15803D",
  divider: "#EADFCB",
};

const FONT_SERIF =
  "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif";
const FONT_SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

// Public links — these come up in the email body and footer.
export const LINKS = {
  website: "https://rathiatithibhawan.org",
  instagram: "https://www.instagram.com/rathiatithibhawan/",
  googleMaps: "https://maps.app.goo.gl/e8k3G1SyH67v2zb66",
  whatsapp: "https://wa.me/919431124912", // owner can update later
  phone: "+91 94311 24912",
  phoneTel: "+919431124912",
  email: "rathibhawan24@gmail.com",
};

function fmtDate(iso: string): string {
  // 'YYYY-MM-DD' -> 'Mon, 1 Jun 2026'
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtCurrency(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

// ---------- The reusable shell — header / body slot / details / CTA / footer ----------
function renderShell(opts: {
  preheader: string; // hidden preview text
  greeting: string;
  bodyHtml: string; // stage-specific paragraphs
  booking: BookingForEmail;
  ctaHtml?: string; // optional centered button block
  closingHtml?: string; // optional sign-off paragraph after CTA
  showAmounts?: boolean; // false for received-only previews
}): string {
  const b = opts.booking;
  const roomsList = b.rooms
    .map((r) => `${r.room_type} (#${r.room_number})`)
    .join(", ");

  const detailsTable = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
           style="background:${BRAND.cream};border:1px solid ${BRAND.border};border-radius:10px;margin-top:8px;">
      <tr><td style="padding:18px 22px 6px;">
        <p style="margin:0 0 4px;color:${BRAND.muted};font-family:${FONT_SANS};font-size:10px;letter-spacing:2px;text-transform:uppercase;">Booking</p>
        <p style="margin:0;color:${BRAND.ink};font-family:${FONT_SANS};font-size:15px;font-weight:600;letter-spacing:1px;">${b.booking_code}</p>
      </td></tr>
      <tr><td style="padding:10px 22px 6px;">
        <p style="margin:0;color:${BRAND.muted};font-family:${FONT_SANS};font-size:10px;letter-spacing:2px;text-transform:uppercase;">Guest</p>
        <p style="margin:2px 0 0;color:${BRAND.text};font-family:${FONT_SANS};font-size:15px;">${escapeHtml(b.guest_name)}</p>
      </td></tr>
      <tr><td style="padding:10px 22px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td width="50%" style="padding-right:8px;">
              <p style="margin:0;color:${BRAND.muted};font-family:${FONT_SANS};font-size:10px;letter-spacing:2px;text-transform:uppercase;">Check-in</p>
              <p style="margin:2px 0 0;color:${BRAND.text};font-family:${FONT_SANS};font-size:14px;font-weight:600;">${fmtDate(b.check_in)}</p>
              <p style="margin:1px 0 0;color:${BRAND.muted};font-family:${FONT_SANS};font-size:11px;">after 12:00 PM</p>
            </td>
            <td width="50%" style="padding-left:8px;border-left:1px dashed ${BRAND.border};">
              <p style="margin:0;color:${BRAND.muted};font-family:${FONT_SANS};font-size:10px;letter-spacing:2px;text-transform:uppercase;">Check-out</p>
              <p style="margin:2px 0 0;color:${BRAND.text};font-family:${FONT_SANS};font-size:14px;font-weight:600;">${fmtDate(b.check_out)}</p>
              <p style="margin:1px 0 0;color:${BRAND.muted};font-family:${FONT_SANS};font-size:11px;">by 11:00 AM</p>
            </td>
          </tr>
        </table>
        <p style="margin:10px 0 0;color:${BRAND.muted};font-family:${FONT_SANS};font-size:12px;">${b.nights} night${b.nights === 1 ? "" : "s"}</p>
      </td></tr>
      <tr><td style="padding:10px 22px 18px;">
        <p style="margin:0;color:${BRAND.muted};font-family:${FONT_SANS};font-size:10px;letter-spacing:2px;text-transform:uppercase;">${b.rooms.length === 1 ? "Room" : `${b.rooms.length} rooms`}</p>
        <p style="margin:2px 0 0;color:${BRAND.text};font-family:${FONT_SANS};font-size:14px;">${escapeHtml(roomsList)}</p>
      </td></tr>
      ${
        opts.showAmounts === false
          ? ""
          : `
      <tr><td style="border-top:1px solid ${BRAND.border};padding:14px 22px 18px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td><p style="margin:0;color:${BRAND.muted};font-family:${FONT_SANS};font-size:12px;">Total</p></td>
            <td align="right"><p style="margin:0;color:${BRAND.text};font-family:${FONT_SANS};font-size:14px;font-weight:600;">${fmtCurrency(b.total_amount)}</p></td>
          </tr>
          <tr>
            <td><p style="margin:6px 0 0;color:${BRAND.muted};font-family:${FONT_SANS};font-size:12px;">Paid</p></td>
            <td align="right"><p style="margin:6px 0 0;color:${BRAND.success};font-family:${FONT_SANS};font-size:14px;font-weight:600;">${fmtCurrency(b.paid_amount)}</p></td>
          </tr>
          ${
            b.balance > 0
              ? `<tr>
            <td><p style="margin:6px 0 0;color:${BRAND.primaryDeep};font-family:${FONT_SANS};font-size:12px;font-weight:600;">Balance due</p></td>
            <td align="right"><p style="margin:6px 0 0;color:${BRAND.primaryDeep};font-family:${FONT_SANS};font-size:14px;font-weight:700;">${fmtCurrency(b.balance)}</p></td>
          </tr>`
              : ""
          }
        </table>
      </td></tr>
      `
      }
    </table>
  `;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rathi Atithi Bhawan</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.cream};font-family:${FONT_SANS};color:${BRAND.text};">
  <!-- Hidden preheader (preview text shown in inbox list) -->
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${BRAND.cream};">
    ${escapeHtml(opts.preheader)}
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${BRAND.cream};">
    <tr>
      <td align="center" style="padding:30px 14px;">

        <!-- Brand header -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
          <tr>
            <td align="center" style="padding:0 0 20px;">
              <p style="margin:0;color:${BRAND.primary};font-family:${FONT_SERIF};font-style:italic;font-size:14px;letter-spacing:1px;">राधे राधे</p>
              <h1 style="margin:6px 0 0;color:${BRAND.ink};font-family:${FONT_SERIF};font-size:30px;font-weight:400;letter-spacing:-0.3px;">Rathi Atithi Bhawan</h1>
              <p style="margin:4px 0 0;color:${BRAND.muted};font-family:${FONT_SANS};font-size:10px;letter-spacing:3px;text-transform:uppercase;">Vrindavan</p>
            </td>
          </tr>
        </table>

        <!-- Card -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"
               style="max-width:600px;background:${BRAND.white};border-radius:14px;border:1px solid ${BRAND.border};overflow:hidden;">
          <!-- Accent strip -->
          <tr><td style="height:6px;background:${BRAND.primary};line-height:6px;font-size:6px;">&nbsp;</td></tr>

          <!-- Body -->
          <tr><td style="padding:36px 36px 8px;">
            <p style="margin:0 0 18px;color:${BRAND.text};font-family:${FONT_SANS};font-size:15px;line-height:1.6;">${escapeHtml(opts.greeting)}</p>
            ${opts.bodyHtml}
          </td></tr>

          <!-- Booking details -->
          <tr><td style="padding:0 36px 8px;">${detailsTable}</td></tr>

          ${
            opts.ctaHtml
              ? `<tr><td style="padding:28px 36px 12px;" align="center">${opts.ctaHtml}</td></tr>`
              : ""
          }

          ${
            opts.closingHtml
              ? `<tr><td style="padding:8px 36px 36px;">${opts.closingHtml}</td></tr>`
              : `<tr><td style="padding:0 36px 36px;"></td></tr>`
          }
        </table>

        <!-- Footer -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;margin-top:24px;">
          <tr><td align="center" style="padding:0 16px;">
            <p style="margin:0 0 8px;color:${BRAND.primaryDeep};font-family:${FONT_SANS};font-size:13px;font-weight:600;">Rathi Atithi Bhawan</p>
            <p style="margin:0 0 10px;color:${BRAND.muted};font-family:${FONT_SANS};font-size:12px;line-height:1.6;">
              Gyan Gudadi, Old Vrindavan · Mathura · Uttar Pradesh
            </p>
            <p style="margin:0 0 14px;font-family:${FONT_SANS};font-size:12px;">
              <a href="tel:${LINKS.phoneTel}" style="color:${BRAND.primaryDeep};text-decoration:none;">Call ${LINKS.phone}</a>
              &nbsp;·&nbsp;
              <a href="${LINKS.whatsapp}" style="color:${BRAND.primaryDeep};text-decoration:none;">WhatsApp</a>
              &nbsp;·&nbsp;
              <a href="mailto:${LINKS.email}" style="color:${BRAND.primaryDeep};text-decoration:none;">Email</a>
            </p>
            <p style="margin:0 0 14px;font-family:${FONT_SANS};font-size:12px;">
              <a href="${LINKS.website}" style="color:${BRAND.primaryDeep};text-decoration:none;">Website</a>
              &nbsp;·&nbsp;
              <a href="${LINKS.instagram}" style="color:${BRAND.primaryDeep};text-decoration:none;">Instagram</a>
              &nbsp;·&nbsp;
              <a href="${LINKS.googleMaps}" style="color:${BRAND.primaryDeep};text-decoration:none;">Map</a>
            </p>
            <p style="margin:14px 0 0;color:${BRAND.muted};font-family:${FONT_SANS};font-size:11px;line-height:1.6;">
              You're receiving this because you have a booking with us.<br>
              Reply to this email to reach the front desk.
            </p>
          </td></tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function ctaButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${BRAND.primary};color:#FFFFFF;font-family:${FONT_SANS};font-size:14px;font-weight:600;text-decoration:none;padding:13px 28px;border-radius:8px;letter-spacing:0.3px;">${label}</a>`;
}

// ============================== STAGES ==============================

export function emailReceived(booking: BookingForEmail): { subject: string; html: string } {
  const html = renderShell({
    preheader: `We've received your booking request, ${booking.guest_name}. We'll confirm shortly.`,
    greeting: `Dear ${booking.guest_name},`,
    bodyHtml: `
      <p style="margin:0 0 12px;color:${BRAND.text};font-family:${FONT_SANS};font-size:15px;line-height:1.65;">
        Thank you for choosing <strong style="color:${BRAND.primaryDeep};">Rathi Atithi Bhawan</strong> for your stay in Vrindavan. We have received your booking request — our front desk is reviewing it and you'll get a confirmation from us shortly, usually within a few hours.
      </p>
      <p style="margin:0 0 8px;color:${BRAND.text};font-family:${FONT_SANS};font-size:15px;line-height:1.65;">
        Here are the details of your request:
      </p>
    `,
    booking,
    closingHtml: `
      <p style="margin:18px 0 0;color:${BRAND.text};font-family:${FONT_SANS};font-size:14px;line-height:1.6;">
        If anything in the details above looks wrong, or you'd like to change something, just reply to this email and we'll sort it out.
      </p>
      <p style="margin:14px 0 0;color:${BRAND.muted};font-family:${FONT_SERIF};font-style:italic;font-size:14px;">
        With folded hands,<br>The Rathi Atithi Bhawan family
      </p>
    `,
  });
  return {
    subject: `Booking request received — ${booking.booking_code} · Rathi Atithi Bhawan`,
    html,
  };
}

export function emailConfirmed(booking: BookingForEmail): { subject: string; html: string } {
  const html = renderShell({
    preheader: `Your stay is confirmed, ${booking.guest_name}. We can't wait to welcome you to Vrindavan.`,
    greeting: `Dear ${booking.guest_name},`,
    bodyHtml: `
      <p style="margin:0 0 12px;color:${BRAND.text};font-family:${FONT_SANS};font-size:15px;line-height:1.65;">
        Wonderful news — your stay at <strong style="color:${BRAND.primaryDeep};">Rathi Atithi Bhawan</strong> is now <strong>confirmed</strong>. We're looking forward to welcoming you to the sacred lanes of Old Vrindavan.
      </p>
      <p style="margin:0 0 8px;color:${BRAND.text};font-family:${FONT_SANS};font-size:15px;line-height:1.65;">
        Please keep this email — it's your confirmation. Your booking code is <strong style="color:${BRAND.primaryDeep};font-family:${FONT_SANS};">${booking.booking_code}</strong>.
      </p>
    `,
    booking,
    ctaHtml: ctaButton(LINKS.googleMaps, "View on Google Maps"),
    closingHtml: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;">
        <tr><td style="background:${BRAND.primarySoft};border-radius:10px;padding:18px 22px;">
          <p style="margin:0 0 8px;color:${BRAND.primaryDeep};font-family:${FONT_SANS};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Before you arrive</p>
          <ul style="margin:0;padding-left:18px;color:${BRAND.text};font-family:${FONT_SANS};font-size:13px;line-height:1.7;">
            <li>Check-in is from 12:00 PM, check-out by 11:00 AM</li>
            <li>Please carry a valid photo ID (Aadhaar / passport / driving licence)</li>
            ${booking.balance > 0 ? `<li>Balance of <strong>${fmtCurrency(booking.balance)}</strong> is payable on arrival</li>` : ""}
            <li>Need a taxi or station pickup? Reply to this email and we'll arrange it</li>
          </ul>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;color:${BRAND.muted};font-family:${FONT_SERIF};font-style:italic;font-size:14px;">
        We look forward to your darshan in Vrindavan.<br>राधे राधे.
      </p>
    `,
  });
  return {
    subject: `Booking confirmed — ${booking.booking_code} · Rathi Atithi Bhawan`,
    html,
  };
}

export function emailCheckedIn(booking: BookingForEmail): { subject: string; html: string } {
  const html = renderShell({
    preheader: `Welcome to Vrindavan, ${booking.guest_name}. Here's everything for your stay.`,
    greeting: `Dear ${booking.guest_name},`,
    bodyHtml: `
      <p style="margin:0 0 12px;color:${BRAND.text};font-family:${FONT_SANS};font-size:15px;line-height:1.65;">
        Welcome to <strong style="color:${BRAND.primaryDeep};">Rathi Atithi Bhawan</strong>, and welcome to the sacred town of Vrindavan. We hope your stay with us is restful, devotional, and joyful.
      </p>
      <p style="margin:0 0 8px;color:${BRAND.text};font-family:${FONT_SANS};font-size:15px;line-height:1.65;">
        A quick note of your stay details, so you have them handy:
      </p>
    `,
    booking,
    closingHtml: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;">
        <tr><td style="background:${BRAND.primarySoft};border-radius:10px;padding:18px 22px;">
          <p style="margin:0 0 8px;color:${BRAND.primaryDeep};font-family:${FONT_SANS};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">During your stay</p>
          <ul style="margin:0;padding-left:18px;color:${BRAND.text};font-family:${FONT_SANS};font-size:13px;line-height:1.7;">
            <li>Pure Satvik meals are served in our dining hall — no onion or garlic</li>
            <li>Walking to Banke Bihari (~25 min), Radha Raman (~10 min), Keshi Ghat aarti (~13 min)</li>
            <li>Need a guide, taxi, or anything else? Reception is happy to help</li>
            <li>Our spiritual library is open to all guests</li>
          </ul>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;color:${BRAND.muted};font-family:${FONT_SERIF};font-style:italic;font-size:14px;">
        Our team is here for you. Anything you need, simply ask.
      </p>
    `,
  });
  return {
    subject: `Welcome to Vrindavan — your stay has begun · Rathi Atithi Bhawan`,
    html,
  };
}

export function emailCheckedOut(booking: BookingForEmail): { subject: string; html: string } {
  // For checkout, suppress the financial summary (the stay is over) but keep the rest.
  const html = renderShell({
    preheader: `Thank you for staying with us, ${booking.guest_name}. We'd love to hear about your experience.`,
    greeting: `Dear ${booking.guest_name},`,
    bodyHtml: `
      <p style="margin:0 0 12px;color:${BRAND.text};font-family:${FONT_SANS};font-size:15px;line-height:1.65;">
        Thank you so very much for staying with us at <strong style="color:${BRAND.primaryDeep};">Rathi Atithi Bhawan</strong>. It was our genuine joy to host you, and we hope the days in Vrindavan were exactly what your heart was seeking.
      </p>
      <p style="margin:0 0 12px;color:${BRAND.text};font-family:${FONT_SANS};font-size:15px;line-height:1.65;">
        If our hospitality made your stay better — even in small ways — we'd be deeply grateful if you'd share a few words on Google. Reviews from devotees and travellers like you help other pilgrims find a peaceful place to stay.
      </p>
      <p style="margin:0;color:${BRAND.muted};font-family:${FONT_SANS};font-size:13px;line-height:1.6;">
        A short, honest review takes about 30 seconds.
      </p>
    `,
    booking,
    showAmounts: false,
    ctaHtml: ctaButton(LINKS.googleMaps, "Leave a Google review"),
    closingHtml: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;">
        <tr><td style="background:${BRAND.primarySoft};border-radius:10px;padding:20px 22px;text-align:center;">
          <p style="margin:0 0 6px;color:${BRAND.primaryDeep};font-family:${FONT_SANS};font-size:13px;font-weight:600;">Follow us on Instagram</p>
          <p style="margin:0 0 10px;color:${BRAND.text};font-family:${FONT_SANS};font-size:13px;line-height:1.5;">
            See the latest from the Bhavan, festival updates, and Braj moments.
          </p>
          <a href="${LINKS.instagram}" style="display:inline-block;color:${BRAND.primaryDeep};font-family:${FONT_SANS};font-size:13px;font-weight:600;text-decoration:none;border:1px solid ${BRAND.primaryDeep};padding:9px 18px;border-radius:8px;">@rathiatithibhawan</a>
        </td></tr>
      </table>

      <p style="margin:22px 0 0;color:${BRAND.text};font-family:${FONT_SANS};font-size:15px;line-height:1.6;">
        Most of all — please come again. Vrindavan calls those who love her, and our doors will always be open to you.
      </p>
      <p style="margin:18px 0 0;color:${BRAND.muted};font-family:${FONT_SERIF};font-style:italic;font-size:15px;">
        With gratitude and folded hands,<br>The Rathi Atithi Bhawan family
      </p>
      <p style="margin:14px 0 0;color:${BRAND.primary};font-family:${FONT_SERIF};font-style:italic;font-size:14px;letter-spacing:1px;">
        राधे राधे
      </p>
    `,
  });
  return {
    subject: `Thank you for your stay — we'd love your review · Rathi Atithi Bhawan`,
    html,
  };
}

// ============================== Dispatcher ==============================

export function renderEmail(
  stage: EmailStage,
  booking: BookingForEmail
): { subject: string; html: string } {
  switch (stage) {
    case "received":
      return emailReceived(booking);
    case "confirmed":
      return emailConfirmed(booking);
    case "checked_in":
      return emailCheckedIn(booking);
    case "checked_out":
      return emailCheckedOut(booking);
  }
}
