-- Weekly report: material priced at its latest purchase price.
--
-- Material used in a week was priced first-in-first-out against the purchase
-- lots it came from. The owner prices by what the material costs now, so a
-- week's consumption is now priced at the material's latest rate up to the
-- week's end (so later purchases don't move past weeks):
--   * bought material — its latest purchase, at landed cost (rate + transport
--     spread over the kg kept after returns)
--   * recycled granules — the latest purchase of the scrap they're made from,
--     at landed cost, grossed up for the scrap type's loss: ₹20/kg scrap at
--     10% loss makes ₹22.22/kg granules
-- A material with no rate up to the week's end takes its first rate after it;
-- one with no rate at all is reported as unpriced.
--
-- Same shape as 20261001000000; rpc_period_material_cost (Reports → Cost per
-- kg) reads this function, so it follows.

create or replace function rpc_stock_check_report(p_from date, p_to date)
returns table (
  count_id uuid,
  prev_count_date date,
  count_date date,
  opening_count_date date,
  raw_material_type_id uuid,
  material_name text,
  is_recycled_output boolean,
  opening_kg numeric,
  purchased_kg numeric,
  returned_kg numeric,
  recycled_kg numeric,
  closing_kg numeric,
  consumed_kg numeric,
  consumed_cost numeric,
  unpriced_kg numeric,
  produced_kg numeric,
  factory_waste_kg numeric
)
language sql stable as $$
  with
  returns_by_purchase as (
    select purchase_id, sum(quantity_kg) as kg
    from raw_material_purchase_returns
    group by purchase_id
  ),
  -- Every known rate per material, dated.
  rates as (
    select
      rp.raw_material_type_id as material_id, rp.entry_date as rate_date, rp.created_at,
      coalesce(rp.price_per_kg, case when rp.total_qty_kg > 0 then rp.cost / rp.total_qty_kg end)
        + case when rp.total_qty_kg - coalesce(r.kg, 0) > 0
            then coalesce(rp.transport_charges, 0) / (rp.total_qty_kg - coalesce(r.kg, 0))
            else 0 end as rate
    from raw_material_purchases rp
    left join returns_by_purchase r on r.purchase_id = rp.id
    union all
    select
      t.id, sp.entry_date, sp.created_at,
      (coalesce(sp.price_per_kg, case when sp.quantity_kg > 0 then sp.cost / sp.quantity_kg end)
        + case when sp.quantity_kg > 0 then coalesce(sp.transport_charges, 0) / sp.quantity_kg else 0 end)
        / (1 - st.loss_pct / 100)
    from scrap_purchases sp
    join scrap_types st on st.id = sp.scrap_type_id
    join raw_material_types t on t.is_recycled_output and t.linked_scrap_type_id = sp.scrap_type_id
  ),
  counts as (
    select id, count_date, lag(count_date) over (order by count_date) as prev_count_date
    from stock_counts
  ),
  -- Each material's count, paired with that material's own previous count.
  items as (
    select
      c.id as count_id, c.count_date, c.prev_count_date as period_prev_date,
      ci.raw_material_type_id as material_id, ci.quantity_kg,
      lag(c.count_date) over w as prev_date,
      lag(ci.quantity_kg) over w as prev_qty
    from stock_count_items ci
    join counts c on c.id = ci.count_id
    window w as (partition by ci.raw_material_type_id order by c.count_date)
  ),
  periods as (
    select
      i.*,
      raw_material_inflow_kg(i.material_id, i.prev_date) - i.prev_qty as c_start,
      raw_material_inflow_kg(i.material_id, i.count_date) - i.quantity_kg as c_end
    from items i
    where i.prev_date is not null
      and i.count_date between p_from and p_to
  ),
  costed as (
    select p.*, coalesce(latest.rate, first_after.rate) as rate
    from periods p
    left join lateral (
      select r.rate from rates r
      where r.material_id = p.material_id and r.rate is not null and r.rate_date <= p.count_date
      order by r.rate_date desc, r.created_at desc
      limit 1
    ) latest on true
    left join lateral (
      select r.rate from rates r
      where r.material_id = p.material_id and r.rate is not null
      order by r.rate_date, r.created_at
      limit 1
    ) first_after on true
  )
  select
    c.count_id,
    c.period_prev_date,
    c.count_date,
    c.prev_date,
    c.material_id,
    t.name,
    t.is_recycled_output,
    c.prev_qty,
    coalesce((
      select sum(rp.total_qty_kg) from raw_material_purchases rp
      where rp.raw_material_type_id = c.material_id
        and rp.entry_date > c.prev_date and rp.entry_date <= c.count_date
    ), 0),
    coalesce((
      select sum(r.quantity_kg)
      from raw_material_purchase_returns r
      join raw_material_purchases rp on rp.id = r.purchase_id
      where rp.raw_material_type_id = c.material_id
        and r.return_date > c.prev_date and r.return_date <= c.count_date
    ), 0),
    case when t.is_recycled_output then coalesce((
      select sum(re.total_output_kg) from recycling_entries re
      where re.source_scrap_type_id = t.linked_scrap_type_id
        and re.output_mode = 'granules'
        and re.entry_date > c.prev_date and re.entry_date <= c.count_date
    ), 0) else 0 end,
    c.quantity_kg,
    c.c_end - c.c_start,
    round((c.c_end - c.c_start) * coalesce(c.rate, 0), 2),
    case when c.rate is null then round(abs(c.c_end - c.c_start), 2) else 0 end,
    coalesce((
      select sum(pe.quantity * pp.weight_kg)
      from production_entries pe
      join pipe_products pp on pp.id = pe.pipe_product_id
      where pe.entry_date > c.period_prev_date and pe.entry_date <= c.count_date
    ), 0),
    coalesce((
      select sum(fw.quantity_kg) from factory_waste_entries fw
      where fw.entry_date > c.period_prev_date and fw.entry_date <= c.count_date
    ), 0)
  from costed c
  join raw_material_types t on t.id = c.material_id
  order by c.count_date desc, t.name;
$$;
