-- =============================================================================
-- Phase 3a — Walk-In Booking Function
-- =============================================================================
-- Run this in the Supabase SQL Editor.
-- Adds an RPC function that admin/staff use to create walk-in bookings
-- atomically (booking + rooms + add-ons + optional initial payment).
-- =============================================================================

create or replace function public.create_walk_in_booking(
  p_guest_name text,
  p_phone text,
  p_email text,
  p_address text,
  p_check_in date,
  p_check_out date,
  p_special_requests text,
  p_rooms jsonb,            -- [{ "room_id": "...", "guests": 2 }, ...]
  p_addons jsonb,           -- [{ "room_id": "...", "addon_id": "...", "quantity": 1 }, ...]
  p_initial_payment jsonb   -- nullable: {"amount": 5000, "mode": "upi", "reference": "...", "notes": "..."}
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
  if p_email is null or p_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception 'Valid email is required';
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
    trim(lower(p_email)),
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

    select base_price into v_room_price from public.rooms
    where id = v_room_id and is_active = true;
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

grant execute on function public.create_walk_in_booking(text, text, text, text, date, date, text, jsonb, jsonb, jsonb) to authenticated;

comment on function public.create_walk_in_booking is
  'Creates a walk-in booking with rooms, add-ons, and optional initial payment, all in one transaction.';
