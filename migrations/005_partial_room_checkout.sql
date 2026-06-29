-- =============================================================================
-- 005 — Partial room checkout
-- =============================================================================
-- Run in the Supabase SQL Editor. Review before applying to production.
--
-- Lets reception check out individual rooms while the booking stays open for
-- the rest. The booking's status is DERIVED: it auto-promotes to 'checked_out'
-- only when every room has been checked out.
--
-- Billing is NOT auto-adjusted (decision #5). booking_rooms.nights and
-- rate_per_night stay as booked; actual_nights is informational only.
--
-- Notifications: the RPCs return a boolean "booking is now fully checked out"
-- (by re-reading bookings.status after the update) so the TypeScript server
-- actions can fire the thank-you email/WhatsApp exactly at the transition.
-- Notifications live in the server-action layer today, not the DB.
--
-- Ambiguity note (cf. migration 004): both RPCs RETURN boolean (scalar), so
-- there are no RETURNS TABLE OUT-param names that could collide with table
-- columns. #variable_conflict use_column is therefore NOT needed. All column
-- refs are table-qualified.
-- =============================================================================


-- 1) Schema ------------------------------------------------------------------
alter table public.booking_rooms
  add column if not exists checked_out_at timestamptz;

alter table public.booking_rooms
  add column if not exists actual_nights int;


-- 2) checkout_booking_room — vacate one room ---------------------------------
-- Idempotent: re-running on an already-checked-out room is a no-op (returns
-- false, no exception). Returns true iff the booking is now fully checked out.
create or replace function public.checkout_booking_room(
  p_booking_room_id uuid,
  p_checked_out_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_booking_id uuid;
  v_already timestamptz;
  v_check_in date;
  v_status text;
  v_checked_out_at timestamptz;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Must be authenticated';
  end if;

  select br.booking_id, br.checked_out_at, b.check_in, b.status
    into v_booking_id, v_already, v_check_in, v_status
  from public.booking_rooms br
  join public.bookings b on b.id = br.booking_id
  where br.id = p_booking_room_id;

  if v_booking_id is null then
    raise exception 'Booking room not found';
  end if;
  if v_status = 'cancelled' then
    raise exception 'Cannot check out a room on a cancelled booking';
  end if;

  -- Idempotent no-op if already checked out.
  if v_already is not null then
    return false;
  end if;

  v_checked_out_at := coalesce(p_checked_out_at, now());

  update public.booking_rooms
  set checked_out_at = v_checked_out_at,
      actual_nights  = greatest(0, (v_checked_out_at::date - v_check_in))::int
  where id = p_booking_room_id;
  -- The AFTER UPDATE OF checked_out_at trigger promotes the booking to
  -- 'checked_out' when this was the last open room.

  -- True iff the booking is now fully checked out (drives the thank-you).
  select b.status into v_status from public.bookings b where b.id = v_booking_id;
  return v_status = 'checked_out';
end;
$$;

grant execute on function public.checkout_booking_room(uuid, timestamptz)
  to authenticated;


-- 3) checkout_entire_booking — vacate all remaining rooms at once -------------
-- Loops the un-checked-out rooms in this transaction, all at one timestamp.
-- Returns true iff the booking transitioned to fully checked out as a result
-- of this call (false if it was already checked out / nothing to do).
create or replace function public.checkout_entire_booking(p_booking_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_status text;
  v_check_in date;
  v_now timestamptz := now();
  v_room record;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Must be authenticated';
  end if;

  select b.status, b.check_in into v_status, v_check_in
  from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'Booking not found';
  end if;
  if v_status = 'cancelled' then
    raise exception 'Cannot check out a cancelled booking';
  end if;
  -- Already fully checked out — no transition, no re-notify.
  if v_status = 'checked_out' then
    return false;
  end if;

  for v_room in
    select br.id from public.booking_rooms br
    where br.booking_id = p_booking_id and br.checked_out_at is null
  loop
    update public.booking_rooms
    set checked_out_at = v_now,
        actual_nights  = greatest(0, (v_now::date - v_check_in))::int
    where id = v_room.id;
    -- Trigger fires per row; the final one auto-promotes the booking.
  end loop;

  -- True iff the booking actually transitioned to checked_out.
  select b.status into v_status from public.bookings b where b.id = p_booking_id;
  return v_status = 'checked_out';
end;
$$;

grant execute on function public.checkout_entire_booking(uuid)
  to authenticated;


-- 4) Promotion trigger function ----------------------------------------------
-- When the last room of a booking is checked out, promote the booking. Status
-- is derived from room-checkout state — never set independently. Only an
-- active stay (confirmed / checked_in) is promoted; cancelled/no_show/expired
-- and an already-checked_out booking are left untouched.
create or replace function public.tg_promote_booking_on_full_checkout()
returns trigger
language plpgsql
as $$
declare
  v_remaining int;
begin
  select count(*) into v_remaining
  from public.booking_rooms
  where booking_id = new.booking_id and checked_out_at is null;

  if v_remaining = 0 then
    update public.bookings
    set status         = 'checked_out',
        checked_out_at = coalesce(checked_out_at, now())
    where id = new.booking_id
      and status in ('confirmed', 'checked_in');
  end if;

  return new;
end;
$$;


-- 5) Trigger on booking_rooms ------------------------------------------------
-- Fires only on a NULL -> NOT NULL transition of checked_out_at. The inner
-- UPDATE on bookings touches only status/checked_out_at (not booking_rooms and
-- not other_charges_amount), so it cannot re-fire this trigger or the migration
-- 003 recalc/other-charges triggers — no recursion.
drop trigger if exists tg_promote_on_full_checkout on public.booking_rooms;
create trigger tg_promote_on_full_checkout
  after update of checked_out_at on public.booking_rooms
  for each row
  when (new.checked_out_at is not null and old.checked_out_at is null)
  execute function public.tg_promote_booking_on_full_checkout();
