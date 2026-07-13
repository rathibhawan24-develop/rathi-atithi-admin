# Applied migrations ledger

> **A migration is not done until it's listed here.** Migrations in `/migrations`
> are applied **manually** in the Supabase SQL editor — writing the file does not
> apply it. **Check this file before testing any UI that depends on schema
> changes.** If the migration isn't listed below with an applied date, assume the
> RPC / column / trigger does **not** exist in production yet and the dependent UI
> will error.

When you apply a migration, add its row here with the real date you ran it.

| # | File | Applied to production | Notes |
|---|------|----------------------|-------|
| 001 | `001_price_overrides_effective_pricing.sql` | 29 Jun 2026 *(inferred — confirm)* | |
| 002 | `002_booking_rpcs_effective_rate.sql` | 29 Jun 2026 *(inferred — confirm)* | |
| 003 | `003_other_charges.sql` | 29 Jun 2026 *(inferred — confirm)* | Adds `set_booking_other_charges` |
| 004 | `004_fix_walk_in_booking_ambiguity.sql` | *(unconfirmed)* | Commit history is out of order for this file; needs a real apply date |
| 005 | `005_partial_room_checkout.sql` | 29 Jun 2026 *(inferred — confirm)* | |
| 006 | `006_checkout_balance_gate.sql` | 29 Jun 2026 *(inferred — confirm)* | Balance gate on final-room checkout |
| 007 | `007_cancel_checked_out_booking.sql` | 10 Jul 2026 | `cancel_checked_out_booking` — required by the "Cancel booking" action on checked-out bookings |

*Dates marked "inferred" were taken from the migration file's add-commit date as a
proxy and are **not** confirmed apply dates. Replace each with the actual date the
migration was run in Supabase and drop the marker.*

## Conventions

**Timestamp rule:** `timestamptz` values (`created_at`, `paid_at`, `checked_out_at`,
notification log `at`, …) → format via the IST util in `lib/utils.ts`
(`formatDate` / `formatDateTime` / `formatDateTimeShort`), which pins output to
`Asia/Kolkata` so server (Vercel = UTC) and browser render identically. Date
columns (`check_in` / `check_out`, stored as `YYYY-MM-DD`) → render verbatim,
**never** timezone-convert (that would shift the calendar day near midnight).
