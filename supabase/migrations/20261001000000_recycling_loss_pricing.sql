-- Recycled granules priced for the scrap lost in recycling.
--
-- Recycling loses about 10% — 100 kg of scrap gives about 90 kg of granules —
-- but the weekly report priced granules as if 1 kg of scrap made 1 kg of
-- granules, so Recycled LD Pipe / Drip Pipe came out ~10% too cheap. Scrap
-- used isn't recorded per recycling entry (dropped in 20260730100000), so
-- each scrap type now carries a loss %, and granules are priced at the cost
-- of the scrap they needed: scrap rate ÷ (1 − loss).
--
-- Also: granules made beyond the scrap that was bought (or from scrap with no
-- price) used to be priced at ₹0 without a word. They now have no rate, so
-- the report counts them in its "no purchase price" warning.

alter table scrap_types
  add column loss_pct numeric(5,2) not null default 10
    check (loss_pct >= 0 and loss_pct < 100);

comment on column scrap_types.loss_pct is
  'Percent of scrap weight lost when recycled into granules. Prices granules in the stock check report.';

-- =========================================================================
-- Weekly report (same shape as 20260929; only granule pricing changes).
-- =========================================================================
create or replace function rpc_stock_check_report(p_from date, p_to date)
returns table (
  count_id uuid,
  -- The count before this one — the period runs from the day after it.
  prev_count_date date,
  count_date date,
  -- The count this material's opening stock came from. Normally the same as
  -- prev_count_date; older when the material was left out of the previous
  -- count (e.g. added to the list later), so its consumption spans longer.
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
  -- Scrap purchase lots, per scrap type, in arrival order, at landed cost
  -- (rate + transport spread over the kg delivered).
  -- A lot with no price at all stays null, so granules made from it are
  -- reported as unpriced instead of free.
  scrap_lots as (
    select
      sp.scrap_type_id,
      coalesce(sp.price_per_kg, case when sp.quantity_kg > 0 then sp.cost / sp.quantity_kg end)
        + case when sp.quantity_kg > 0 then coalesce(sp.transport_charges, 0) / sp.quantity_kg else 0 end as rate,
      sum(sp.quantity_kg) over (
        partition by sp.scrap_type_id order by sp.entry_date, sp.created_at, sp.id
      ) as cum_end,
      sp.quantity_kg as qty
    from scrap_purchases sp
  ),
  -- Recycled granule output, positioned along its source's cumulative scrap
  -- use. Scrap used isn't recorded per batch, so it's worked back from the
  -- output and the scrap type's loss: 90 kg of granules at 10% loss used
  -- 100 kg of scrap.
  granule_entries as (
    select
      re.id, re.entry_date, re.created_at, re.source_scrap_type_id,
      re.total_output_kg as qty,
      re.total_output_kg / (1 - st.loss_pct / 100) as scrap_qty,
      sum(re.total_output_kg / (1 - st.loss_pct / 100)) over (
        partition by re.source_scrap_type_id order by re.entry_date, re.created_at, re.id
      ) as scrap_cum_end
    from recycling_entries re
    join scrap_types st on st.id = re.source_scrap_type_id
    where re.output_mode = 'granules' and re.total_output_kg > 0
  ),
  -- The priced scrap each granule batch used, FIFO: how many kg of it had a
  -- purchase price, and what they cost.
  granule_scrap as (
    select
      ge.*,
      coalesce(sum(greatest(0,
        least(sl.cum_end, ge.scrap_cum_end) - greatest(sl.cum_end - sl.qty, ge.scrap_cum_end - ge.scrap_qty)))
        filter (where sl.rate is not null), 0) as priced_scrap_kg,
      coalesce(sum(sl.rate * greatest(0,
        least(sl.cum_end, ge.scrap_cum_end) - greatest(sl.cum_end - sl.qty, ge.scrap_cum_end - ge.scrap_qty)))
        filter (where sl.rate is not null), 0) as scrap_cost
    from granule_entries ge
    left join scrap_lots sl on sl.scrap_type_id = ge.source_scrap_type_id
    group by ge.id, ge.entry_date, ge.created_at, ge.source_scrap_type_id, ge.qty, ge.scrap_qty, ge.scrap_cum_end
  ),
  -- Each batch as up to two lots: the granules from priced scrap, carrying
  -- that scrap's whole cost (so the loss is paid for by the granules that
  -- came out), and any granules beyond the scrap bought, with no rate.
  granule_lots as (
    select
      t.id as material_id, gs.entry_date as lot_date, gs.created_at, gs.id, 0 as seq,
      gs.qty * gs.priced_scrap_kg / gs.scrap_qty as qty,
      case when gs.priced_scrap_kg > 0 then gs.scrap_cost / (gs.qty * gs.priced_scrap_kg / gs.scrap_qty) end as rate
    from granule_scrap gs
    join raw_material_types t
      on t.is_recycled_output and t.linked_scrap_type_id = gs.source_scrap_type_id
    union all
    select
      t.id, gs.entry_date, gs.created_at, gs.id, 1,
      gs.qty * (1 - gs.priced_scrap_kg / gs.scrap_qty),
      null::numeric
    from granule_scrap gs
    join raw_material_types t
      on t.is_recycled_output and t.linked_scrap_type_id = gs.source_scrap_type_id
  ),
  returns_by_purchase as (
    select purchase_id, sum(quantity_kg) as kg
    from raw_material_purchase_returns
    group by purchase_id
  ),
  -- Purchase lots net of what was sent back: returned kg never gets consumed.
  -- Priced at landed cost: transport is spread over the kg actually kept,
  -- since the freight on returned material isn't refunded.
  purchase_lots as (
    select
      rp.raw_material_type_id as material_id, rp.entry_date as lot_date, rp.created_at, rp.id, 0 as seq,
      rp.total_qty_kg - coalesce(r.kg, 0) as qty,
      coalesce(rp.price_per_kg, case when rp.total_qty_kg > 0 then rp.cost / rp.total_qty_kg end)
        + case when rp.total_qty_kg - coalesce(r.kg, 0) > 0
            then coalesce(rp.transport_charges, 0) / (rp.total_qty_kg - coalesce(r.kg, 0))
            else 0 end as rate
    from raw_material_purchases rp
    left join returns_by_purchase r on r.purchase_id = rp.id
  ),
  priced_lots as (
    select material_id, lot_date, created_at, id, seq, qty, rate from purchase_lots
    union all
    select material_id, lot_date, created_at, id, seq, qty, rate from granule_lots
  ),
  -- Opening stock has no rate of its own; use the material's earliest known
  -- one. Rates stay null where nothing is known (legacy rows with no cost), so
  -- that consumption is reported as unpriced instead of silently free.
  first_rate as (
    select distinct on (material_id) material_id, rate
    from priced_lots
    where rate is not null
    order by material_id, lot_date, created_at, id, seq
  ),
  all_lots as (
    select ob.item_id as material_id, '-infinity'::date as lot_date,
      '-infinity'::timestamptz as created_at, ob.id, 0 as seq, ob.quantity as qty, fr.rate
    from opening_balances ob
    left join first_rate fr on fr.material_id = ob.item_id
    where ob.item_type = 'raw_material' and ob.quantity > 0
    union all
    select material_id, lot_date, created_at, id, seq, qty, rate
    from priced_lots
    where qty > 0.001
  ),
  lots as (
    select
      material_id, rate, qty,
      sum(qty) over (partition by material_id order by lot_date, created_at, id, seq) as cum_end
    from all_lots
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
    select
      p.*,
      sign(p.c_end - p.c_start) * coalesce(slice.cost, 0) as cost,
      abs(p.c_end - p.c_start) - coalesce(slice.kg, 0) as unpriced
    from periods p
    left join lateral (
      select
        sum(coalesce(l.rate, 0) * greatest(0,
          least(l.cum_end, greatest(p.c_start, p.c_end))
          - greatest(l.cum_end - l.qty, least(p.c_start, p.c_end)))) as cost,
        sum(greatest(0,
          least(l.cum_end, greatest(p.c_start, p.c_end))
          - greatest(l.cum_end - l.qty, least(p.c_start, p.c_end))))
          filter (where l.rate is not null) as kg
      from lots l
      where l.material_id = p.material_id
    ) slice on true
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
    round(c.cost, 2),
    round(c.unpriced, 2),
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
