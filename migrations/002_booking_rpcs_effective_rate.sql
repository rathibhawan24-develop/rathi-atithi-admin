-- =============================================================================
-- 002 — Booking RPCs store the override-aware nightly rate
-- =============================================================================
-- Run this in the Supabase SQL Editor. Review before applying to production.
--
-- Depends on 001 (get_effective_room_prices). Makes the four booking-creation /
-- room-mutation RPCs store the EFFECTIVE per-night rate in
-- booking_rooms.rate_per_night instead of rooms.base_price, so a booking made
-- during a festival/seasonal window is charged the override rate.
--
-- Per-function change (the only change in each — everything else is verbatim):
--   was:  select base_price into <rate> from rooms where id = <room> and is_active;
--   now:  1. keep an is_active guard FIRST (get_effective_room_prices does not
--            filter inactive rooms),
--         2. select effective_nightly from
--            get_effective_room_prices(array[<room>], <check_in>, <check_out>).
--
-- effective_nightly (= stay_total / nights, 2dp) is the per-night value; the
-- booking total is rate_per_night * nights via tg_recalc_booking_totals. For a
-- stay straddling an override boundary, rate_per_night * nights can differ from
-- the exact stay_total by a few paise — booking_rooms has a single rate column,
-- so exact per-night billing remains Phase 2.
--
-- NOT touched (intentionally): update_booking_room_rate (manual staff override)
-- and update_booking_room (guests + add-ons only).
--
-- Grants are preserved automatically by CREATE OR REPLACE.
-- =============================================================================


-- 1) create_booking (customer web, status 'pending') ---------------------------
CREATE OR REPLACE FUNCTION public.create_booking(p_guest_name text, p_phone text, p_email text, p_check_in date, p_check_out date, p_special_requests text, p_rooms jsonb, p_addons jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_booking_id uuid;
  v_booking_code text;
  v_room jsonb;
  v_addon jsonb;
  v_room_booking_id uuid;
  v_room_price numeric;
  v_nights int;
  v_addon_price numeric;
  v_addon_per_night boolean;
  v_addon_max int;
  v_total_charge numeric;
  v_room_id uuid;
  v_addon_count int;
begin
  if p_guest_name is null or length(trim(p_guest_name)) = 0 then
    raise exception 'Guest name is required';
  end if;
  if p_phone is null or length(trim(p_phone)) < 7 then
    raise exception 'Valid phone number is required';
  end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Valid email is required';
  end if;
  if p_check_in < current_date then
    raise exception 'Check-in date cannot be in the past';
  end if;
  if p_check_out <= p_check_in then
    raise exception 'Check-out must be after check-in';
  end if;
  if jsonb_array_length(p_rooms) = 0 then
    raise exception 'At least one room is required';
  end if;

  v_nights := (p_check_out - p_check_in)::int;

  insert into public.bookings (
    guest_name, phone, email, check_in, check_out,
    special_requests, status, source
  ) values (
    trim(p_guest_name), trim(p_phone), trim(lower(p_email)), p_check_in, p_check_out,
    p_special_requests, 'pending', 'web'
  ) returning id, booking_code into v_booking_id, v_booking_code;

  for v_room in select * from jsonb_array_elements(p_rooms)
  loop
    v_room_id := (v_room->>'room_id')::uuid;

    if not public.check_room_availability(v_room_id, p_check_in, p_check_out) then
      raise exception 'Room is not available for the selected dates';
    end if;

    -- is_active guard FIRST (get_effective_room_prices does not filter inactive)
    if not exists (
      select 1 from public.rooms where id = v_room_id and is_active = true
    ) then
      raise exception 'Room not found or inactive';
    end if;

    -- Override-aware nightly rate for this stay window
    select effective_nightly into v_room_price
    from public.get_effective_room_prices(array[v_room_id]::uuid[], p_check_in, p_check_out)
    limit 1;
    if v_room_price is null then
      raise exception 'Room not found or inactive';
    end if;

    insert into public.booking_rooms (booking_id, room_id, rate_per_night, nights, guests)
    values (v_booking_id, v_room_id, v_room_price, v_nights, coalesce((v_room->>'guests')::int, 1))
    returning id into v_room_booking_id;

    if p_addons is not null and jsonb_typeof(p_addons) = 'array' then
      for v_addon in
        select value from jsonb_array_elements(p_addons) where value->>'room_id' = v_room_id::text
      loop
        select price, is_per_night, max_per_room
          into v_addon_price, v_addon_per_night, v_addon_max
        from public.addons
        where id = (v_addon->>'addon_id')::uuid and is_active = true;

        if v_addon_price is null then
          raise exception 'Add-on not found or inactive';
        end if;

        v_addon_count := coalesce((v_addon->>'quantity')::int, 1);
        if v_addon_count > v_addon_max then
          raise exception 'Add-on quantity exceeds max_per_room';
        end if;

        v_total_charge := v_addon_price * v_addon_count *
                          (case when v_addon_per_night then v_nights else 1 end);

        insert into public.booking_room_addons (booking_room_id, addon_id, quantity, unit_price, total_charge)
        values (v_room_booking_id, (v_addon->>'addon_id')::uuid, v_addon_count, v_addon_price, v_total_charge);
      end loop;
    end if;
  end loop;

  return jsonb_build_object(
    'booking_id', v_booking_id,
    'booking_code', v_booking_code
  );
end;
$function$;


-- 2) create_walk_in_booking (admin walk-in, status 'confirmed') ----------------
create or replace function public.create_walk_in_booking(
  p_guest_name text,
  p_phone text,
  p_email text,
  p_address text,
  p_check_in date,
  p_check_out date,
  p_special_requests text,
  p_rooms jsonb,
  p_addons jsonb,
  p_initial_payment jsonb
)
returns table (booking_id uuid, booking_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id uuid;
  v_booking_code text;
  v_user_id uuid;
  v_clean_email text;
  v_room jsonb;
  v_addon jsonb;
  v_room_booking_id uuid;
  v_room_price numeric;
  v_nights int;
  v_addon_price numeric;
  v_addon_per_night boolean;
  v_addon_max int;
  v_total_charge numeric;
  v_room_id uuid;
  v_addon_count int;
  v_payment_mode text;
  v_payment_amount numeric;
begin
  -- Auth check: must be a logged-in admin/staff
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Must be authenticated';
  end if;

  -- Basic validation
  if p_guest_name is null or length(trim(p_guest_name)) = 0 then
    raise exception 'Guest name is required';
  end if;
  if p_phone is null or length(trim(p_phone)) < 7 then
    raise exception 'Valid phone number is required';
  end if;
  -- Walk-in email is OPTIONAL (reception books guests without email).
  -- Validate format only when one is provided.
  v_clean_email := nullif(trim(lower(coalesce(p_email, ''))), '');
  if v_clean_email is not null
     and v_clean_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception 'Email format is invalid';
  end if;
  if p_check_out <= p_check_in then
    raise exception 'Check-out must be after check-in';
  end if;
  if jsonb_array_length(p_rooms) = 0 then
    raise exception 'At least one room is required';
  end if;

  v_nights := (p_check_out - p_check_in)::int;

  -- Create the booking (confirmed walk-in)
  insert into public.bookings (
    guest_name, phone, email, address,
    check_in, check_out,
    special_requests,
    status, source, created_by, confirmed_at
  ) values (
    trim(p_guest_name),
    trim(p_phone),
    v_clean_email,
    nullif(trim(coalesce(p_address, '')), ''),
    p_check_in, p_check_out,
    nullif(trim(coalesce(p_special_requests, '')), ''),
    'confirmed', 'walk_in', v_user_id, now()
  ) returning id, booking_code into v_booking_id, v_booking_code;

  -- Insert each room
  for v_room in select * from jsonb_array_elements(p_rooms)
  loop
    v_room_id := (v_room->>'room_id')::uuid;

    -- Availability check (excluding our just-created booking)
    if not public.check_room_availability(v_room_id, p_check_in, p_check_out, v_booking_id) then
      raise exception 'Room is not available for the selected dates';
    end if;

    -- is_active guard FIRST (get_effective_room_prices does not filter inactive)
    if not exists (
      select 1 from public.rooms where id = v_room_id and is_active = true
    ) then
      raise exception 'Room not found or inactive';
    end if;

    -- Override-aware nightly rate for this stay window
    select effective_nightly into v_room_price
    from public.get_effective_room_prices(array[v_room_id]::uuid[], p_check_in, p_check_out)
    limit 1;
    if v_room_price is null then
      raise exception 'Room not found or inactive';
    end if;

    insert into public.booking_rooms (booking_id, room_id, rate_per_night, nights, guests)
    values (v_booking_id, v_room_id, v_room_price, v_nights, coalesce((v_room->>'guests')::int, 1))
    returning id into v_room_booking_id;

    -- Insert add-ons matching this room
    if p_addons is not null and jsonb_typeof(p_addons) = 'array' then
      for v_addon in
        select value from jsonb_array_elements(p_addons) where value->>'room_id' = v_room_id::text
      loop
        select price, is_per_night, max_per_room
          into v_addon_price, v_addon_per_night, v_addon_max
        from public.addons
        where id = (v_addon->>'addon_id')::uuid and is_active = true;

        if v_addon_price is null then
          raise exception 'Add-on not found or inactive';
        end if;

        v_addon_count := coalesce((v_addon->>'quantity')::int, 1);
        if v_addon_count > v_addon_max then
          raise exception 'Add-on quantity exceeds max_per_room (% allowed)', v_addon_max;
        end if;

        v_total_charge := v_addon_price * v_addon_count *
                          (case when v_addon_per_night then v_nights else 1 end);

        insert into public.booking_room_addons (booking_room_id, addon_id, quantity, unit_price, total_charge)
        values (v_room_booking_id, (v_addon->>'addon_id')::uuid, v_addon_count, v_addon_price, v_total_charge);
      end loop;
    end if;
  end loop;

  -- Optional initial payment
  if p_initial_payment is not null and jsonb_typeof(p_initial_payment) = 'object' then
    v_payment_amount := (p_initial_payment->>'amount')::numeric;
    v_payment_mode := p_initial_payment->>'mode';

    if v_payment_amount is not null and v_payment_amount > 0 and v_payment_mode in ('upi', 'cash', 'bank') then
      insert into public.payments (booking_id, amount, mode, reference_number, notes, recorded_by)
      values (
        v_booking_id,
        v_payment_amount,
        v_payment_mode,
        nullif(trim(coalesce(p_initial_payment->>'reference', '')), ''),
        nullif(trim(coalesce(p_initial_payment->>'notes', '')), ''),
        v_user_id
      );
    end if;
  end if;

  return query select v_booking_id, v_booking_code;
end;
$$;


-- 3) add_room_to_booking (admin, add a room to an existing booking) ------------
CREATE OR REPLACE FUNCTION public.add_room_to_booking(p_booking_id uuid, p_room_id uuid, p_guests integer, p_addons jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_booking record;
  v_room record;
  v_nights int;
  v_booking_room_id uuid;
  v_addon record;
  v_addon_entry jsonb;
  v_qty int;
  v_total_charge numeric;
  v_rate_per_night numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Must be authenticated'; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF v_booking.status IN ('checked_out', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot edit a booking that is checked out or cancelled';
  END IF;

  SELECT id, name, base_price, max_occupancy, is_active
    INTO v_room FROM public.rooms WHERE id = p_room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.is_active = false THEN RAISE EXCEPTION 'Room is inactive'; END IF;

  IF p_guests IS NULL OR p_guests < 1 THEN
    RAISE EXCEPTION 'Guest count must be at least 1'; END IF;
  IF p_guests > v_room.max_occupancy THEN
    RAISE EXCEPTION 'Guest count exceeds room capacity (max %)', v_room.max_occupancy;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.booking_rooms
    WHERE booking_id = p_booking_id AND room_id = p_room_id
  ) THEN
    RAISE EXCEPTION 'Room is already part of this booking';
  END IF;
  IF NOT public.check_room_availability(p_room_id, v_booking.check_in, v_booking.check_out, p_booking_id) THEN
    RAISE EXCEPTION 'Room is not available for the booking dates';
  END IF;

  v_nights := (v_booking.check_out - v_booking.check_in)::int;

  -- Override-aware nightly rate for the booking's stay window
  -- (is_active already guarded above).
  SELECT effective_nightly INTO v_rate_per_night
  FROM public.get_effective_room_prices(array[p_room_id]::uuid[], v_booking.check_in, v_booking.check_out)
  LIMIT 1;
  IF v_rate_per_night IS NULL THEN RAISE EXCEPTION 'Room not found or inactive'; END IF;

  INSERT INTO public.booking_rooms (booking_id, room_id, rate_per_night, nights, guests)
  VALUES (p_booking_id, p_room_id, v_rate_per_night, v_nights, p_guests)
  RETURNING id INTO v_booking_room_id;

  IF p_addons IS NOT NULL AND jsonb_typeof(p_addons) = 'array' THEN
    FOR v_addon_entry IN SELECT value FROM jsonb_array_elements(p_addons) LOOP
      v_qty := COALESCE((v_addon_entry->>'quantity')::int, 0);
      CONTINUE WHEN v_qty <= 0;
      SELECT id, name, price, is_per_night, max_per_room, is_active
        INTO v_addon FROM public.addons WHERE id = (v_addon_entry->>'addon_id')::uuid;
      IF NOT FOUND THEN RAISE EXCEPTION 'Add-on not found'; END IF;
      IF v_addon.is_active = false THEN
        RAISE EXCEPTION 'Add-on % is inactive', v_addon.name; END IF;
      IF v_qty > v_addon.max_per_room THEN
        RAISE EXCEPTION 'Add-on % allows maximum % per room', v_addon.name, v_addon.max_per_room;
      END IF;
      v_total_charge := v_addon.price * v_qty *
                        (CASE WHEN v_addon.is_per_night THEN v_nights ELSE 1 END);
      INSERT INTO public.booking_room_addons
        (booking_room_id, addon_id, quantity, unit_price, total_charge)
      VALUES (v_booking_room_id, v_addon.id, v_qty, v_addon.price, v_total_charge);
    END LOOP;
  END IF;

  UPDATE public.bookings SET updated_at = now() WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'booking_room_id', v_booking_room_id,
    'room_id', p_room_id,
    'rate_per_night', v_rate_per_night,
    'nights', v_nights
  );
END;
$function$;


-- 4) swap_booking_room (admin, swap one room for another) ----------------------
CREATE OR REPLACE FUNCTION public.swap_booking_room(p_booking_id uuid, p_old_booking_room_id uuid, p_new_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_booking record;
  v_old_room record;
  v_new_room record;
  v_new_booking_room_id uuid;
  v_addon record;
  v_nights int;
  v_rate_per_night numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Must be authenticated'; END IF;

  SELECT b.* INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF v_booking.status IN ('checked_out', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot edit a booking that is checked out or cancelled';
  END IF;

  SELECT br.id, br.guests, br.room_id INTO v_old_room
  FROM public.booking_rooms br
  WHERE br.id = p_old_booking_room_id AND br.booking_id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found in this booking'; END IF;

  IF v_old_room.room_id = p_new_room_id THEN
    RAISE EXCEPTION 'Already in this room';
  END IF;

  SELECT id, base_price, max_occupancy, is_active INTO v_new_room
  FROM public.rooms WHERE id = p_new_room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'New room not found'; END IF;
  IF v_new_room.is_active = false THEN
    RAISE EXCEPTION 'New room is inactive'; END IF;
  IF v_old_room.guests > v_new_room.max_occupancy THEN
    RAISE EXCEPTION 'New room capacity (%) is less than current guests (%). Reduce guests first.',
      v_new_room.max_occupancy, v_old_room.guests;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.booking_rooms
    WHERE booking_id = p_booking_id AND room_id = p_new_room_id
  ) THEN
    RAISE EXCEPTION 'New room is already part of this booking';
  END IF;

  IF NOT public.check_room_availability(p_new_room_id, v_booking.check_in, v_booking.check_out, p_booking_id) THEN
    RAISE EXCEPTION 'New room is not available for the booking dates';
  END IF;

  v_nights := (v_booking.check_out - v_booking.check_in)::int;

  -- Override-aware nightly rate for the new room over the booking's stay window
  -- (is_active already guarded above).
  SELECT effective_nightly INTO v_rate_per_night
  FROM public.get_effective_room_prices(array[p_new_room_id]::uuid[], v_booking.check_in, v_booking.check_out)
  LIMIT 1;
  IF v_rate_per_night IS NULL THEN RAISE EXCEPTION 'New room not found or inactive'; END IF;

  INSERT INTO public.booking_rooms (booking_id, room_id, rate_per_night, nights, guests)
  VALUES (p_booking_id, p_new_room_id, v_rate_per_night, v_nights, v_old_room.guests)
  RETURNING id INTO v_new_booking_room_id;

  FOR v_addon IN
    SELECT addon_id, quantity, unit_price, total_charge
    FROM public.booking_room_addons
    WHERE booking_room_id = p_old_booking_room_id
  LOOP
    INSERT INTO public.booking_room_addons
      (booking_room_id, addon_id, quantity, unit_price, total_charge)
    VALUES
      (v_new_booking_room_id, v_addon.addon_id, v_addon.quantity, v_addon.unit_price, v_addon.total_charge);
  END LOOP;

  DELETE FROM public.booking_rooms WHERE id = p_old_booking_room_id;

  UPDATE public.bookings SET updated_at = now() WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'new_booking_room_id', v_new_booking_room_id,
    'new_room_id', p_new_room_id,
    'rate_per_night', v_rate_per_night
  );
END;
$function$;
