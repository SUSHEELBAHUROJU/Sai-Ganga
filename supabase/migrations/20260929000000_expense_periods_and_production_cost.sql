-- Expenses get the period they pay for, separate from the day they were paid,
-- so the cost of making pipe can be worked out per month and per stock-check
-- week.
--
-- Until now an expense had only entry_date (the day the money went out), and
-- every report bucketed by it: an electricity bill for August paid on 18 Sep
-- counted as a September expense. Now:
--
--   entry_date                → when it was paid (the cash view, unchanged)
--   period_start … period_end → which days it pays for (the cost view)
--
-- How a type asks for its period is set per expense type:
--   one_time   — the day it was paid (misc, diesel, repairs)
--   date_range — explicit start and end (weekly salary)
--   month      — a calendar month (monthly salary, shed rent, electricity)
--
-- A period's amount is spread evenly over its days, so a report range gets
-- the share for the days it overlaps. A month-tagged bill is therefore whole
-- in its month's report, and split by days only when a stock-check week
-- needs its piece of that month.
--
-- Also: material cost in the weekly report now uses landed cost — purchase
-- rate plus transport per kg — since freight is part of what material costs.

-- =========================================================================
-- 1. Expense types: period style, production-cost switch, meter units
-- =========================================================================
alter table expense_categories
  add column period_type text not null default 'one_time'
    check (period_type in ('one_time', 'date_range', 'month')),
  add column in_production_cost boolean not null default true,
  add column tracks_units boolean not null default false;

-- Weekly and monthly salaries are both salaries in the expense report, so
-- more than one type can now carry is_salary.
drop index if exists expense_categories_one_salary;

update expense_categories set period_type = 'month' where is_salary;
update expense_categories set name = 'Monthly Salary'
  where is_salary and name = 'Salaries'
    and not exists (select 1 from expense_categories where name = 'Monthly Salary');
update expense_categories set period_type = 'month', tracks_units = true
  where name = 'Electricity Bill';

insert into expense_categories (name, is_salary, period_type) values
  ('Weekly Salary', true, 'date_range'),
  ('Shed Rent', false, 'month')
on conflict (name) do nothing;

-- =========================================================================
-- 2. Expenses: the period paid for, and meter units
-- =========================================================================
alter table expenses
  add column period_start date,
  add column period_end date,
  add column units numeric(12,2) check (units is null or units >= 0);

-- Existing expenses cover the day they were paid — exactly how every report
-- treated them until now, so no past total moves.
update expenses set period_start = entry_date, period_end = entry_date;

alter table expenses
  alter column period_start set not null,
  alter column period_end set not null,
  add constraint expenses_period_order check (period_end >= period_start);

create index idx_expenses_period on expenses (period_start, period_end);

-- A write that leaves the period out (a one-time expense) covers the paid date.
create or replace function fill_expense_period()
returns trigger language plpgsql as $$
begin
  if new.period_start is null then
    new.period_start := new.entry_date;
  end if;
  if new.period_end is null then
    new.period_end := new.period_start;
  end if;
  return new;
end;
$$;

create trigger fill_expense_period before insert or update on expenses
  for each row execute function fill_expense_period();

-- =========================================================================
-- 3. Expense share for a date range — each expense's amount (and units)
--    spread evenly over its period, times the days that fall in the range.
-- =========================================================================
create or replace function expense_allocations(p_from date, p_to date)
returns table (
  expense_id uuid,
  entry_date date,
  category_id uuid,
  category_name text,
  is_salary boolean,
  in_production_cost boolean,
  period_type text,
  period_start date,
  period_end date,
  amount numeric,
  units numeric,
  notes text,
  period_days integer,
  overlap_days integer,
  allocated_amount numeric,
  allocated_units numeric
)
language sql stable as $$
  select
    e.id, e.entry_date, c.id, c.name, c.is_salary, c.in_production_cost, c.period_type,
    e.period_start, e.period_end, e.amount, e.units, e.notes,
    e.period_end - e.period_start + 1,
    least(e.period_end, p_to) - greatest(e.period_start, p_from) + 1,
    e.amount * (least(e.period_end, p_to) - greatest(e.period_start, p_from) + 1)
      / (e.period_end - e.period_start + 1),
    e.units * (least(e.period_end, p_to) - greatest(e.period_start, p_from) + 1)
      / (e.period_end - e.period_start + 1)
  from expenses e
  join expense_categories c on c.id = e.category_id
  where e.period_start <= p_to and e.period_end >= p_from
  order by e.period_start, e.entry_date;
$$;

revoke execute on function expense_allocations(date, date) from public;
grant execute on function expense_allocations(date, date) to authenticated;

-- =========================================================================
-- 4. Running costs per stock-check week — the production-cost expense types'
--    share of the days from the previous count to this one.
-- =========================================================================
create or replace function rpc_stock_check_overheads(p_from date, p_to date)
returns table (
  count_id uuid,
  category_id uuid,
  category_name text,
  is_salary boolean,
  amount numeric,
  units numeric
)
language sql stable as $$
  with counts as (
    select id, count_date, lag(count_date) over (order by count_date) as prev_count_date
    from stock_counts
  )
  select c.id, a.category_id, a.category_name, a.is_salary,
    sum(a.allocated_amount), sum(a.allocated_units)
  from counts c
  cross join lateral expense_allocations(c.prev_count_date + 1, c.count_date) a
  where c.prev_count_date is not null
    and c.count_date between p_from and p_to
    and a.in_production_cost
  group by c.id, a.category_id, a.category_name, a.is_salary
  order by sum(a.allocated_amount) desc;
$$;

revoke execute on function rpc_stock_check_overheads(date, date) from public;
grant execute on function rpc_stock_check_overheads(date, date) to authenticated;

-- =========================================================================
-- 5. Weekly report with landed material cost (same shape as 20260928).
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
  scrap_lots as (
    select
      sp.scrap_type_id,
      coalesce(sp.price_per_kg, case when sp.quantity_kg > 0 then sp.cost / sp.quantity_kg end, 0)
        + case when sp.quantity_kg > 0 then coalesce(sp.transport_charges, 0) / sp.quantity_kg else 0 end as rate,
      sum(sp.quantity_kg) over (
        partition by sp.scrap_type_id order by sp.entry_date, sp.created_at, sp.id
      ) as cum_end,
      sp.quantity_kg as qty
    from scrap_purchases sp
  ),
  -- Recycled granule output, positioned along its source's cumulative output.
  granule_entries as (
    select
      re.id, re.entry_date, re.created_at, re.source_scrap_type_id,
      re.total_output_kg as qty,
      sum(re.total_output_kg) over (
        partition by re.source_scrap_type_id order by re.entry_date, re.created_at, re.id
      ) as cum_end
    from recycling_entries re
    where re.output_mode = 'granules' and re.total_output_kg > 0
  ),
  -- Each granule batch priced at the FIFO cost of the scrap it used.
  granule_lots as (
    select
      t.id as material_id, ge.entry_date as lot_date, ge.created_at, ge.id, ge.qty,
      coalesce((
        select sum(sl.rate * greatest(0,
          least(sl.cum_end, ge.cum_end) - greatest(sl.cum_end - sl.qty, ge.cum_end - ge.qty)))
        from scrap_lots sl
        where sl.scrap_type_id = ge.source_scrap_type_id
      ), 0) / ge.qty as rate
    from granule_entries ge
    join raw_material_types t
      on t.is_recycled_output and t.linked_scrap_type_id = ge.source_scrap_type_id
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
      rp.raw_material_type_id as material_id, rp.entry_date as lot_date, rp.created_at, rp.id,
      rp.total_qty_kg - coalesce(r.kg, 0) as qty,
      coalesce(rp.price_per_kg, case when rp.total_qty_kg > 0 then rp.cost / rp.total_qty_kg end)
        + case when rp.total_qty_kg - coalesce(r.kg, 0) > 0
            then coalesce(rp.transport_charges, 0) / (rp.total_qty_kg - coalesce(r.kg, 0))
            else 0 end as rate
    from raw_material_purchases rp
    left join returns_by_purchase r on r.purchase_id = rp.id
  ),
  priced_lots as (
    select material_id, lot_date, created_at, id, qty, rate from purchase_lots
    union all
    select material_id, lot_date, created_at, id, qty, rate from granule_lots
  ),
  -- Opening stock has no rate of its own; use the material's earliest known
  -- one. Rates stay null where nothing is known (legacy rows with no cost), so
  -- that consumption is reported as unpriced instead of silently free.
  first_rate as (
    select distinct on (material_id) material_id, rate
    from priced_lots
    where rate is not null
    order by material_id, lot_date, created_at, id
  ),
  all_lots as (
    select ob.item_id as material_id, '-infinity'::date as lot_date,
      '-infinity'::timestamptz as created_at, ob.id, ob.quantity as qty, fr.rate
    from opening_balances ob
    left join first_rate fr on fr.material_id = ob.item_id
    where ob.item_type = 'raw_material' and ob.quantity > 0
    union all
    select material_id, lot_date, created_at, id, qty, rate
    from priced_lots
    where qty > 0
  ),
  lots as (
    select
      material_id, rate, qty,
      sum(qty) over (partition by material_id order by lot_date, created_at, id) as cum_end
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

-- =========================================================================
-- 6. Material consumed in a calendar range (e.g. a month).
--
-- Consumption is only known between two counts. A stock-check period that
-- lies partly outside the range contributes the share of its days that fall
-- inside — an estimate, flagged as such. Days after the last count (or before
-- the first) aren't covered at all; covered_from/covered_to say which days
-- the material figures stand for, and covered_produced_kg is the pipe made on
-- exactly those days, so material ₹/kg compares like with like.
-- =========================================================================
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
  with rows as (
    select r.*,
      (least(r.count_date, p_to) - greatest(r.opening_count_date + 1, p_from) + 1)::numeric
        / (r.count_date - r.opening_count_date) as share
    from rpc_stock_check_report(p_from, p_to + 400) r
    where r.opening_count_date < p_to and r.count_date >= p_from
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
    bool_or(r.share < 1),
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
