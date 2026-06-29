-- =============================================================================
-- 006 — Balance gate on final-room checkout
-- =============================================================================
-- Business rule: any room in a booking can be checked out while balance > 0
-- (reception marks rooms as vacated through the day). BUT the LAST room — the
-- one that would promote bookings.status to 'checked_out' — requires balance
-- to be zero. This protects against guests walking out without settling.
--
-- The gate lives in the RPC layer (canonical, cannot be bypassed). The UI
-- mirrors the same rule for friendly messaging.
-- =============================================================================

-- 1) checkout_booking_room — block when this would close the last open room
--    AND the booking still has a positive balance.
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
  v_balance numeric;
  v_open_rooms int;
  v_checked_out_at timestamptz;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Must be authenticated';
  end if;

  select br.booking_id, br.checked_out_at, b.check_in, b.status, b.balance
    into v_booking_id, v_already, v_check_in, v_status, v_balance
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

  -- Balance gate: if this would close the LAST open room (i.e. this is the
  -- room that promotes the booking to checked_out), require zero balance.
  -- Intermediate rooms can be checked out with balance owing — only the
  -- final one is gated.
  select count(*) into v_open_rooms
  from public.booking_rooms
  where booking_id = v_booking_id and checked_out_at is null;

  if v_open_rooms = 1 and coalesce(v_balance, 0) > 0 then
    raise exception 'Cannot check out the final room with balance Rs. % due. Record payment first.', v_balance;
  end if;

  v_checked_out_at := coalesce(p_checked_out_at, now());

  update public.booking_rooms
  set checked_out_at = v_checked_out_at,
      actual_nights  = greatest(0, (v_checked_out_at::date - v_check_in))::int
  where id = p_booking_room_id;

  -- True iff the booking is now fully checked out.
  select b.status into v_status from public.bookings b where b.id = v_booking_id;
  return v_status = 'checked_out';
end;
$$;

grant execute on function public.checkout_booking_room(uuid, timestamptz)
  to authenticated;


-- 2) checkout_entire_booking — block entirely when balance > 0.
--    (This RPC checks out ALL remaining rooms, so by definition the last one
--    would be included. The gate refuses upfront.)
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
  v_balance numeric;
  v_now timestamptz := now();
  v_room record;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Must be authenticated';
  end if;

  select b.status, b.check_in, b.balance into v_status, v_check_in, v_balance
  from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'Booking not found';
  end if;
  if v_status = 'cancelled' then
    raise exception 'Cannot check out a cancelled booking';
  end if;
  if v_status = 'checked_out' then
    return false;
  end if;

  -- Balance gate: this RPC closes ALL remaining rooms, so it always touches
  -- the final one. Refuse upfront if balance is owed.
  if coalesce(v_balance, 0) > 0 then
    raise exception 'Cannot check out booking with balance Rs. % due. Record payment first.', v_balance;
  end if;

  for v_room in
    select br.id from public.booking_rooms br
    where br.booking_id = p_booking_id and br.checked_out_at is null
  loop
    update public.booking_rooms
    set checked_out_at = v_now,
        actual_nights  = greatest(0, (v_now::date - v_check_in))::int
    where id = v_room.id;
  end loop;

  select b.status into v_status from public.bookings b where b.id = p_booking_id;
  return v_status = 'checked_out';
end;
$$;

grant execute on function public.checkout_entire_booking(uuid)
  to authenticated;

comment on function public.checkout_booking_room is
  'Vacate one room. Idempotent. Final-room checkout gated by zero balance.';
comment on function public.checkout_entire_booking is
  'Vacate all remaining rooms. Gated by zero balance (always touches final room).';
