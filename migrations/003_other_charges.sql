-- =============================================================================
-- 003 — Other charges line on bookings
-- =============================================================================
-- Run in the Supabase SQL Editor. Review before applying to production.
--
-- Adds a free-form positive charge line to bookings (mirrors the discount
-- feature). New total formula:
--   total_amount = rooms_subtotal + addons_subtotal
--                  + other_charges_amount - discount_amount
--
-- Other charges are folded into the GROSS before the discount cap/subtract, so
-- a discount applies to the full bill including extras (Indian hotel convention).
--
-- Refactor: the recalc math is centralized into recalc_booking_totals(uuid) so
-- there is a single source of truth shared by all three triggers
-- (booking_rooms, booking_room_addons, and the new bookings trigger).
-- =============================================================================


-- 1) Schema ------------------------------------------------------------------
alter table public.bookings
  add column if not exists other_charges_amount numeric not null default 0;

alter table public.bookings
  add column if not exists other_charges_note text;


-- 2) Centralized recalc — single source of truth ----------------------------
-- Body is the existing tg_recalc_booking_totals logic from "Recompute the gross
-- components" onward, parametrized on p_booking_id, with other_charges_amount
-- added to the gross. Discount cap/subtract logic preserved verbatim.
create or replace function public.recalc_booking_totals(p_booking_id uuid)
returns void
language plpgsql
as $$
declare
  v_rooms_sub numeric;
  v_addons_sub numeric;
  v_gross numeric;
  v_discount_type text;
  v_discount_value numeric;
  v_discount_amount numeric;
  v_other_charges numeric;
begin
  if p_booking_id is null then
    return;
  end if;

  -- Recompute the gross components
  select coalesce(sum(subtotal), 0) into v_rooms_sub
  from public.booking_rooms where booking_id = p_booking_id;

  select coalesce(sum(bra.total_charge), 0) into v_addons_sub
  from public.booking_room_addons bra
  join public.booking_rooms br on br.id = bra.booking_room_id
  where br.booking_id = p_booking_id;

  -- Read current discount + other-charges settings on the booking
  select discount_type, discount_value, coalesce(other_charges_amount, 0)
    into v_discount_type, v_discount_value, v_other_charges
  from public.bookings where id = p_booking_id;

  -- Other charges are part of the gross BEFORE the discount cap/subtract,
  -- so the discount applies to the full bill including extras.
  v_gross := v_rooms_sub + v_addons_sub + coalesce(v_other_charges, 0);

  -- Re-compute discount_amount based on type
  if v_discount_type = 'percent' then
    v_discount_amount := round(v_gross * v_discount_value / 100, 2);
  elsif v_discount_type = 'amount' then
    v_discount_amount := v_discount_value;
  else
    v_discount_amount := 0;
  end if;
  -- Cap discount at gross so total can never go negative
  if v_discount_amount > v_gross then
    v_discount_amount := v_gross;
  end if;

  update public.bookings
  set rooms_subtotal = v_rooms_sub,
      addons_subtotal = v_addons_sub,
      discount_amount = v_discount_amount,
      total_amount = v_gross - v_discount_amount
  where id = p_booking_id;
end;
$$;

grant execute on function public.recalc_booking_totals(uuid) to authenticated;


-- 3) tg_recalc_booking_totals — now a thin wrapper over recalc_booking_totals
-- Triggers on booking_rooms / booking_room_addons keep pointing at this same
-- function name (unchanged attachments); only the body is replaced.
create or replace function public.tg_recalc_booking_totals()
returns trigger
language plpgsql
as $$
declare
  v_booking_id uuid;
begin
  -- find booking_id from either source table
  if tg_table_name = 'booking_rooms' then
    v_booking_id := coalesce(new.booking_id, old.booking_id);
  elsif tg_table_name = 'booking_room_addons' then
    select booking_id into v_booking_id
    from public.booking_rooms
    where id = coalesce(new.booking_room_id, old.booking_room_id);
  end if;

  if v_booking_id is null then
    return coalesce(new, old);
  end if;

  perform public.recalc_booking_totals(v_booking_id);
  return coalesce(new, old);
end;
$$;


-- 4) New bookings trigger function — fires the same recalc on other-charges edit
create or replace function public.tg_recalc_after_other_charges()
returns trigger
language plpgsql
as $$
begin
  perform public.recalc_booking_totals(new.id);
  return new;
end;
$$;


-- 5) New trigger on bookings -------------------------------------------------
-- AFTER UPDATE OF other_charges_amount + the IS DISTINCT FROM guard means the
-- inner recalc UPDATE (which sets rooms_subtotal/addons_subtotal/discount_amount/
-- total_amount, never other_charges_amount) does NOT re-fire this trigger.
drop trigger if exists tg_recalc_on_other_charges on public.bookings;
create trigger tg_recalc_on_other_charges
  after update of other_charges_amount on public.bookings
  for each row
  when (new.other_charges_amount is distinct from old.other_charges_amount)
  execute function public.tg_recalc_after_other_charges();


-- 6) RPC: set / clear other charges (admin only) -----------------------------
-- Recalc is handled by the new trigger; this RPC just writes the columns.
create or replace function public.set_booking_other_charges(
  p_booking_id uuid,
  p_amount numeric,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_status text;
  v_note text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Must be authenticated';
  end if;

  -- Positive charges only; negative adjustments use the discount feature.
  if p_amount is null or p_amount < 0 then
    raise exception 'Other charges amount must be zero or positive';
  end if;

  select status into v_status from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Booking not found';
  end if;
  -- Same guard the other booking-mutation RPCs use.
  if v_status in ('checked_out', 'cancelled') then
    raise exception 'Cannot edit a booking that is checked out or cancelled';
  end if;

  -- Clearing the charge clears the note too, for a clean state.
  if p_amount = 0 then
    v_note := null;
  else
    v_note := nullif(trim(coalesce(p_note, '')), '');
  end if;

  update public.bookings
  set other_charges_amount = p_amount,
      other_charges_note   = v_note,
      updated_at           = now()
  where id = p_booking_id;
end;
$$;

grant execute on function public.set_booking_other_charges(uuid, numeric, text)
  to authenticated;

comment on function public.set_booking_other_charges is
  'Set or clear a free-form positive charge on a booking. Admin only. '
  'Amount must be >= 0; amount = 0 also clears the note. Recalc trigger updates total.';
