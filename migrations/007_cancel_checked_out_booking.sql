-- =============================================================================
-- 007 — Cancel a checked-out booking (soft cancel, Option A)
-- =============================================================================
-- Reception occasionally leaves test / mistaken bookings in the 'checked_out'
-- state with a non-zero balance. Those pollute revenue and occupancy reports
-- (which count non-cancelled stays). This RPC lets an admin soft-cancel such a
-- booking so it drops out of the reports, WITHOUT touching the money columns.
--
-- Scope is deliberately narrow: it ONLY transitions 'checked_out' -> 'cancelled'.
-- The normal lifecycle (updateBookingStatus / StatusTransitions) forbids any
-- transition out of 'checked_out', which is why this needs a dedicated RPC.
--
-- Money is left exactly as-is: paid_amount is untouched and balance is a
-- GENERATED column, so it recomputes itself and is never written here.
--
-- Auth pattern mirrors set_booking_other_charges (003): security definer,
-- auth.uid() null-check, grant execute to authenticated. Admin-role gating is
-- enforced in the server action layer (same as deletePayment).
-- =============================================================================

create or replace function public.cancel_checked_out_booking(
  p_booking_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_status text;
  v_reason text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Must be authenticated';
  end if;

  -- A reason is mandatory — this is a destructive, out-of-band action and we
  -- want an audit trail of why. (UI also enforces a minimum length.)
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'A cancellation reason is required';
  end if;

  select status into v_status from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Booking not found';
  end if;

  -- This RPC is only for cleaning up checked-out bookings. Any other status
  -- (including already-cancelled) is rejected so callers use the normal flow.
  if v_status <> 'checked_out' then
    raise exception 'Only checked-out bookings can be cancelled here (booking is %)', v_status;
  end if;

  update public.bookings
  set status              = 'cancelled',
      cancelled_at        = now(),
      cancellation_reason = v_reason,
      updated_at          = now()
  where id = p_booking_id;
  -- Note: paid_amount is intentionally NOT modified; balance is a GENERATED
  -- column and recomputes on its own.
end;
$$;

grant execute on function public.cancel_checked_out_booking(uuid, text)
  to authenticated;

comment on function public.cancel_checked_out_booking is
  'Soft-cancel a checked-out booking (test / mistaken bookings) so it drops '
  'out of revenue and occupancy reports. Sets status=cancelled, cancelled_at, '
  'cancellation_reason. Does not touch money. Admin only (enforced in action).';
