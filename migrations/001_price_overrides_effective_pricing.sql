-- =============================================================================
-- 001 — Price overrides: effective nightly pricing
-- =============================================================================
-- Run this in the Supabase SQL Editor. Review before applying to production.
--
-- Adds get_effective_room_prices(): given a set of rooms and a stay window,
-- returns the override-aware rate FOR EACH NIGHT and the rolled-up stay total.
--
-- It does NOT modify get_available_rooms or get_rooms_with_availability — both
-- keep their current return shapes. Callers run this function once after the
-- availability search and merge the pricing in TypeScript. This keeps the
-- availability RPCs untouched (no DROP / signature churn, fully non-breaking)
-- and serves all three callsites with one function.
--
-- Resolution order, evaluated per night, per room (most specific wins):
--   (a) room-specific override (applies_to_room_id NOT NULL)
--       beats room-type override beats all-rooms override
--   (b) within the same scope, lower priority number wins
--   (c) tiebreak: newest created_at wins
--
-- Rate for an overridden night:
--   flat_rate  present -> use flat_rate
--   multiplier present -> base_price * multiplier (2dp)
--   otherwise          -> base_price (no override matched that night)
--
-- A stay's nights are the dates slept on: check_in .. (check_out - 1).
-- =============================================================================

create or replace function public.get_effective_room_prices(
  p_room_ids  uuid[],
  p_check_in  date,
  p_check_out date
)
returns table (
  room_id           uuid,
  base_price        numeric,
  nights            int,
  stay_total        numeric,   -- exact sum of each night's rate (use this, NOT base_price * nights)
  effective_nightly numeric,   -- stay_total / nights, for a per-night chip
  is_uniform        boolean,   -- true if every night is the same rate
  override_applied  boolean,   -- true if any night was overridden
  override_name     text,      -- name covering the most nights (tiebreak: highest rate)
  nightly_breakdown jsonb      -- [{ "date", "rate", "override_name" }, ...] ordered by date
)
language sql
stable
security definer
set search_path = public
as $$
  with nights_series as (
    select d::date as night
    from generate_series(p_check_in, p_check_out - 1, interval '1 day') as d
  ),
  rooms_in as (
    select r.id, r.room_type, r.base_price
    from public.rooms r
    where r.id = any(p_room_ids)
  ),
  -- For each (room, night) pick the single best-matching active override.
  per_night as (
    select
      ri.id         as room_id,
      ri.base_price as base_price,
      ns.night      as night,
      ov.name       as override_name,
      case
        when ov.id is null            then ri.base_price
        when ov.flat_rate is not null then ov.flat_rate
        when ov.multiplier is not null then round(ri.base_price * ov.multiplier, 2)
        else ri.base_price
      end as rate
    from rooms_in ri
    cross join nights_series ns
    left join lateral (
      select po.id, po.name, po.flat_rate, po.multiplier
      from public.price_overrides po
      where po.is_active = true
        and ns.night between po.start_date and po.end_date
        and (
              po.applies_to_room_id = ri.id
          or (po.applies_to_room_id is null and po.applies_to_room_type = ri.room_type)
          or (po.applies_to_room_id is null and po.applies_to_room_type is null)
        )
      order by
        -- (a) specificity: room-specific > room-type > all
        case
          when po.applies_to_room_id   is not null then 3
          when po.applies_to_room_type is not null then 2
          else 1
        end desc,
        po.priority   asc,   -- (b) lower number wins
        po.created_at desc,  -- (c) newest wins
        po.id         desc   -- final deterministic tiebreak
      limit 1
    ) ov on true
  )
  select
    pn.room_id,
    max(pn.base_price)                          as base_price,
    count(*)::int                               as nights,
    sum(pn.rate)                                as stay_total,
    round(sum(pn.rate) / nullif(count(*), 0), 2) as effective_nightly,
    (count(distinct pn.rate) = 1)               as is_uniform,
    bool_or(pn.override_name is not null)       as override_applied,
    (
      select pn2.override_name
      from per_night pn2
      where pn2.room_id = pn.room_id
        and pn2.override_name is not null
      group by pn2.override_name
      order by count(*) desc, max(pn2.rate) desc
      limit 1
    )                                           as override_name,
    jsonb_agg(
      jsonb_build_object(
        'date',          pn.night,
        'rate',          pn.rate,
        'override_name', pn.override_name
      )
      order by pn.night
    )                                           as nightly_breakdown
  from per_night pn
  group by pn.room_id;
$$;

grant execute on function public.get_effective_room_prices(uuid[], date, date)
  to anon, authenticated;

comment on function public.get_effective_room_prices is
  'Override-aware nightly pricing for a stay window. Returns per-room stay_total, '
  'effective_nightly, uniformity flag, and a nightly_breakdown jsonb. Does not '
  'mutate the availability RPCs; callers merge this in after the room search.';
