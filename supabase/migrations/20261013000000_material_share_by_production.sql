-- Cost per kg: a stock-check week cut by the range is shared by pipe made.
--
-- When a report range cuts through a stock-check week, the week's material
-- was shared by calendar days. A day with no production (a Sunday, a power
-- cut) still got a full day's material, so ₹/kg came out too high — e.g.
-- 4 Oct–12 Oct pulled 1/6 of the week ending 4 Oct (2100 kg, ₹65k) onto a
-- Sunday with no pipe, showing ₹61.18/kg against the week's real ₹54.69.
--
-- The share is now the part of the week's pipe made on the days inside the
-- range. A week with no production at all still falls back to days. A week
-- whose in-range days made no pipe contributes nothing and isn't flagged as
-- an estimate.

create or replace function rpc_period_material_cost(p_from date, p_to date)
returns table (
  raw_material_type_id uuid,
  material_name text,
  consumed_kg numeric,
  consumed_cost numeric,
  unpriced_kg numeric,
  is_estimated boolean,
  covered_from date,
  covered_to date,
  covered_produced_kg numeric
)
language sql stable as $$
  with report as (
    select * from rpc_stock_check_report(p_from, p_to + 400) r
    where r.opening_count_date < p_to and r.count_date >= p_from
  ),
  -- Opening → count stretches; more than one per week when a material was
  -- left out of the previous count.
  spans as (
    select distinct r.opening_count_date, r.count_date,
      greatest(r.opening_count_date + 1, p_from) as in_from,
      least(r.count_date, p_to) as in_to
    from report r
  ),
  span_share as (
    select s.opening_count_date, s.count_date,
      case
        when coalesce(pk.total_kg, 0) > 0 then coalesce(pk.in_kg, 0) / pk.total_kg
        else (s.in_to - s.in_from + 1)::numeric / (s.count_date - s.opening_count_date)
      end as share
    from spans s
    left join lateral (
      select
        sum(pe.quantity * pp.weight_kg) as total_kg,
        sum(pe.quantity * pp.weight_kg) filter (
          where pe.entry_date between s.in_from and s.in_to
        ) as in_kg
      from production_entries pe
      join pipe_products pp on pp.id = pe.pipe_product_id
      where pe.entry_date > s.opening_count_date and pe.entry_date <= s.count_date
    ) pk on true
  ),
  rows as (
    select r.*, ss.share
    from report r
    join span_share ss
      on ss.opening_count_date = r.opening_count_date and ss.count_date = r.count_date
  ),
  coverage as (
    select
      min(greatest(prev_count_date + 1, p_from)) as covered_from,
      max(least(count_date, p_to)) as covered_to
    from rows
    where prev_count_date < p_to
  )
  select
    r.raw_material_type_id,
    r.material_name,
    sum(r.consumed_kg * r.share),
    sum(r.consumed_cost * r.share),
    sum(r.unpriced_kg * r.share),
    bool_or(r.share > 0 and r.share < 1),
    cv.covered_from,
    cv.covered_to,
    coalesce((
      select sum(pe.quantity * pp.weight_kg)
      from production_entries pe
      join pipe_products pp on pp.id = pe.pipe_product_id
      where pe.entry_date between cv.covered_from and cv.covered_to
    ), 0)
  from rows r
  cross join coverage cv
  group by r.raw_material_type_id, r.material_name, cv.covered_from, cv.covered_to
  order by sum(r.consumed_kg * r.share) desc;
$$;

revoke execute on function rpc_period_material_cost(date, date) from public;
grant execute on function rpc_period_material_cost(date, date) to authenticated;
