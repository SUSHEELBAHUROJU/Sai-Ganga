-- Weekly stock check, FIFO material cost, and returns of raw-material purchases.
--
-- Until now raw material was only ever added (opening + purchases + recycled
-- granules) and never consumed, so raw_material_stock grew forever. The owner
-- now counts what is physically left, usually at week end, and from two
-- consecutive counts the app works out:
--
--   consumed = previous count + purchased − returned + recycled − this count
--
-- Consumption is priced first-in-first-out against the actual purchase lots,
-- since the rate for the same material moves lot to lot. Recycled granules
-- are priced the same way against the scrap purchased for their source
-- (1 kg scrap → 1 kg granules; output beyond purchased scrap came from the
-- factory's own waste and costs nothing).
--
-- Returns (bad material sent back) are recorded against the purchase they came
-- from. Their money value is derived from that purchase's rate at read time —
-- never stored — so editing the purchase moves the return with it, the same
-- "no copies, nothing to drift" rule the supplier ledger already follows.

-- =========================================================================
-- 1. Stock counts
-- =========================================================================
create table stock_counts (
  id uuid primary key default gen_random_uuid(),
  count_date date not null unique,
  notes text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table stock_count_items (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references stock_counts(id) on delete cascade,
  raw_material_type_id uuid not null references raw_material_types(id),
  entry_mode text not null check (entry_mode in ('bag', 'direct_kg')),
  pack_kg numeric(6,2) check (pack_kg is null or pack_kg > 0),
  num_bags numeric(10,2) check (num_bags is null or num_bags >= 0),
  quantity_kg numeric(10,2) not null check (quantity_kg >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (count_id, raw_material_type_id),
  constraint stock_count_items_mode_fields check (
    (entry_mode = 'bag' and pack_kg is not null and num_bags is not null)
    or (entry_mode = 'direct_kg' and pack_kg is null and num_bags is null)
  )
);

create index idx_stock_count_items_material on stock_count_items (raw_material_type_id);

create trigger set_updated_at before update on stock_counts
  for each row execute function set_updated_at();
create trigger set_updated_at before update on stock_count_items
  for each row execute function set_updated_at();

-- =========================================================================
-- 2. Purchase returns
-- =========================================================================
create table raw_material_purchase_returns (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references raw_material_purchases(id) on delete cascade,
  return_date date not null default current_date,
  quantity_kg numeric(10,2) not null check (quantity_kg > 0),
  reason text not null check (btrim(reason) <> ''),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_purchase_returns_purchase on raw_material_purchase_returns (purchase_id);
create index idx_purchase_returns_date on raw_material_purchase_returns (return_date);

create trigger set_updated_at before update on raw_material_purchase_returns
  for each row execute function set_updated_at();

-- Can't return more than was bought, or before it arrived. The purchase row is
-- locked so two returns saved at once can't both pass the check.
create or replace function check_purchase_return()
returns trigger language plpgsql as $$
declare
  v_purchase raw_material_purchases;
  v_other numeric;
begin
  select * into v_purchase from raw_material_purchases where id = new.purchase_id for update;

  if new.return_date < v_purchase.entry_date then
    raise exception 'Return date cannot be before the purchase date (%)', v_purchase.entry_date;
  end if;

  select coalesce(sum(quantity_kg), 0) into v_other
  from raw_material_purchase_returns
  where purchase_id = new.purchase_id and id <> new.id;

  if v_other + new.quantity_kg > v_purchase.total_qty_kg then
    raise exception 'Cannot return % kg — only % kg of this purchase is left to return',
      new.quantity_kg, v_purchase.total_qty_kg - v_other;
  end if;

  return new;
end;
$$;

create trigger check_purchase_return before insert or update on raw_material_purchase_returns
  for each row execute function check_purchase_return();

-- Editing a purchase down below what has already been returned would leave a
-- negative lot.
create or replace function check_purchase_not_below_returns()
returns trigger language plpgsql as $$
declare
  v_returned numeric;
begin
  if new.total_qty_kg < old.total_qty_kg then
    select coalesce(sum(quantity_kg), 0) into v_returned
    from raw_material_purchase_returns where purchase_id = new.id;
    if new.total_qty_kg < v_returned then
      raise exception 'Quantity cannot be less than the % kg already returned', v_returned;
    end if;
  end if;
  return new;
end;
$$;

create trigger check_purchase_not_below_returns before update on raw_material_purchases
  for each row execute function check_purchase_not_below_returns();

-- =========================================================================
-- 3. RLS — created after 20260731000000_require_authentication.sql, so lock
--    down explicitly, same posture as supplier_ledger_transactions.
-- =========================================================================
alter table stock_counts enable row level security;
alter table stock_count_items enable row level security;
alter table raw_material_purchase_returns enable row level security;

create policy "must be signed in" on stock_counts
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "must be signed in" on stock_count_items
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "must be signed in" on raw_material_purchase_returns
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

revoke all on stock_counts, stock_count_items, raw_material_purchase_returns from public, anon;
grant select, insert, update, delete on stock_counts, stock_count_items, raw_material_purchase_returns
  to authenticated;

-- =========================================================================
-- 4. Save a count in one step: upsert the count for its date and replace its
--    items, so re-saving a date edits that count instead of duplicating it.
-- =========================================================================
create or replace function save_stock_count(p_date date, p_notes text, p_items jsonb)
returns stock_counts
language plpgsql as $$
declare
  v_count stock_counts;
  v_item jsonb;
begin
  insert into stock_counts (count_date, notes)
  values (p_date, nullif(btrim(coalesce(p_notes, '')), ''))
  on conflict (count_date) do update set notes = excluded.notes, updated_at = now()
  returning * into v_count;

  delete from stock_count_items where count_id = v_count.id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into stock_count_items (count_id, raw_material_type_id, entry_mode, pack_kg, num_bags, quantity_kg)
    values (
      v_count.id,
      (v_item->>'raw_material_type_id')::uuid,
      v_item->>'entry_mode',
      (v_item->>'pack_kg')::numeric,
      (v_item->>'num_bags')::numeric,
      (v_item->>'quantity_kg')::numeric
    );
  end loop;

  return v_count;
end;
$$;

revoke execute on function save_stock_count(date, text, jsonb) from public;
grant execute on function save_stock_count(date, text, jsonb) to authenticated;

-- =========================================================================
-- 5. Inflow helper — everything that has come into a material's stock up to
--    and including a date: opening + purchases − returns + recycled granules.
--    Returns count on the day they went back, not the purchase date: the
--    material was physically in stock (and counted) until then.
-- =========================================================================
create or replace function raw_material_inflow_kg(p_material_id uuid, p_upto date)
returns numeric
language sql stable as $$
  select
    coalesce((
      select quantity from opening_balances
      where item_type = 'raw_material' and item_id = p_material_id
    ), 0)
    + coalesce((
      select sum(total_qty_kg) from raw_material_purchases
      where raw_material_type_id = p_material_id and entry_date <= p_upto
    ), 0)
    - coalesce((
      select sum(r.quantity_kg)
      from raw_material_purchase_returns r
      join raw_material_purchases rp on rp.id = r.purchase_id
      where rp.raw_material_type_id = p_material_id and r.return_date <= p_upto
    ), 0)
    + coalesce((
      select sum(re.total_output_kg)
      from recycling_entries re
      join raw_material_types t on t.id = p_material_id
      where t.is_recycled_output
        and re.source_scrap_type_id = t.linked_scrap_type_id
        and re.output_mode = 'granules'
        and re.entry_date <= p_upto
    ), 0);
$$;

revoke execute on function raw_material_inflow_kg(uuid, date) from public;
grant execute on function raw_material_inflow_kg(uuid, date) to authenticated;

-- =========================================================================
-- 6. raw_material_stock — returns come off, and once a material has been
--    counted its live stock starts from the latest count instead of adding up
--    every purchase ever made. New columns are appended (create or replace
--    can only add trailing columns).
-- =========================================================================
create or replace view raw_material_stock
  with (security_invoker = true) as
with last_count as (
  select distinct on (ci.raw_material_type_id)
    ci.raw_material_type_id, sc.count_date, ci.quantity_kg
  from stock_count_items ci
  join stock_counts sc on sc.id = ci.count_id
  order by ci.raw_material_type_id, sc.count_date desc
),
returned as (
  select rp.raw_material_type_id, sum(r.quantity_kg) as total
  from raw_material_purchase_returns r
  join raw_material_purchases rp on rp.id = r.purchase_id
  group by rp.raw_material_type_id
),
base as (
  select
    t.id,
    t.name,
    t.is_active,
    t.is_recycled_output,
    coalesce(ob.quantity, 0) as opening_kg,
    coalesce(purch.total, 0) as purchased_kg,
    case when t.is_recycled_output then coalesce(recy.total, 0) else 0 end as recycled_output_kg,
    coalesce(ret.total, 0) as returned_kg,
    lc.count_date as last_count_date,
    lc.quantity_kg as last_count_kg,
    lst.min_quantity
  from raw_material_types t
  left join opening_balances ob on ob.item_type = 'raw_material' and ob.item_id = t.id
  left join (
    select raw_material_type_id, sum(total_qty_kg) as total
    from raw_material_purchases
    group by raw_material_type_id
  ) purch on purch.raw_material_type_id = t.id
  left join (
    select source_scrap_type_id, sum(total_output_kg) as total
    from recycling_entries
    where output_mode = 'granules'
    group by source_scrap_type_id
  ) recy on t.is_recycled_output and recy.source_scrap_type_id = t.linked_scrap_type_id
  left join returned ret on ret.raw_material_type_id = t.id
  left join last_count lc on lc.raw_material_type_id = t.id
  left join low_stock_thresholds lst on lst.item_type = 'raw_material' and lst.item_id = t.id
),
stock as (
  select
    b.*,
    case
      when b.last_count_date is null
        then b.opening_kg + b.purchased_kg - b.returned_kg + b.recycled_output_kg
      else b.last_count_kg
        + b.opening_kg + b.purchased_kg - b.returned_kg + b.recycled_output_kg
        - raw_material_inflow_kg(b.id, b.last_count_date)
    end as current_stock
  from base b
)
select
  s.id as raw_material_type_id,
  s.name,
  s.is_active,
  s.is_recycled_output,
  s.opening_kg,
  s.purchased_kg,
  s.recycled_output_kg,
  s.current_stock,
  s.min_quantity as low_stock_threshold,
  s.min_quantity is not null and s.current_stock < s.min_quantity as is_low_stock,
  s.returned_kg,
  s.last_count_date,
  s.last_count_kg
from stock s;

-- =========================================================================
-- 7. Supplier ledger — a return is a credit against the supplier at the
--    purchase's rate.
-- =========================================================================
create or replace function purchase_return_amount(p_qty numeric, p_price_per_kg numeric, p_cost numeric, p_total_qty numeric)
returns numeric
language sql immutable as $$
  select round(
    p_qty * coalesce(p_price_per_kg, case when p_total_qty > 0 then p_cost / p_total_qty end, 0),
    2
  );
$$;

revoke execute on function purchase_return_amount(numeric, numeric, numeric, numeric) from public;
grant execute on function purchase_return_amount(numeric, numeric, numeric, numeric) to authenticated;

create or replace view supplier_ledger_balance
  with (security_invoker = true) as
with txn_totals as (
  select
    party_type,
    coalesce(supplier_id, scrap_dealer_id) as party_id,
    coalesce(sum(amount) filter (where type = 'due'), 0) as manual_due,
    coalesce(sum(amount) filter (where type = 'payment'), 0) as paid,
    coalesce(sum(amount) filter (where type = 'refund'), 0) as refunded
  from supplier_ledger_transactions
  group by party_type, coalesce(supplier_id, scrap_dealer_id)
),
supplier_returns as (
  select rp.supplier_id,
    sum(purchase_return_amount(r.quantity_kg, rp.price_per_kg, rp.cost, rp.total_qty_kg)) as total
  from raw_material_purchase_returns r
  join raw_material_purchases rp on rp.id = r.purchase_id
  where rp.supplier_id is not null and rp.cost is not null
  group by rp.supplier_id
),
parties as (
  select
    'supplier'::text as party_type,
    s.id as party_id,
    s.name,
    s.phone,
    s.is_active,
    coalesce(p.total, 0) - coalesce(sr.total, 0) as purchased
  from raw_material_suppliers s
  left join (
    select supplier_id, sum(cost) as total
    from raw_material_purchases
    where supplier_id is not null and cost is not null
    group by supplier_id
  ) p on p.supplier_id = s.id
  left join supplier_returns sr on sr.supplier_id = s.id
  union all
  select
    'scrap_dealer'::text,
    d.id,
    d.name,
    d.phone,
    d.is_active,
    coalesce(p.total, 0)
  from scrap_dealers d
  left join (
    select scrap_dealer_id, sum(cost) as total
    from scrap_purchases
    where scrap_dealer_id is not null and cost is not null
    group by scrap_dealer_id
  ) p on p.scrap_dealer_id = d.id
)
select
  pa.party_type,
  pa.party_id,
  pa.name,
  pa.phone,
  pa.is_active,
  pa.purchased + coalesce(t.manual_due, 0) as total_purchased,
  coalesce(t.paid, 0) - coalesce(t.refunded, 0) as total_paid,
  pa.purchased + coalesce(t.manual_due, 0) + coalesce(t.refunded, 0) - coalesce(t.paid, 0) as balance
from parties pa
left join txn_totals t on t.party_type = pa.party_type and t.party_id = pa.party_id;

-- Same shape as 20260926010000; adds 'return' events, which reduce what is owed.
create or replace function rpc_supplier_passbook(p_party_type text, p_party_id uuid)
returns table (
  id uuid,
  kind text,
  entry_date date,
  amount numeric,
  running_balance numeric,
  item_name text,
  quantity_kg numeric,
  price_per_kg numeric,
  payment_mode text,
  payment_app text,
  paid_to text,
  reference_no text,
  bank_account text,
  paid_by text,
  note text,
  created_at timestamptz
)
language sql stable as $$
  with events as (
    select
      rp.id, 'purchase'::text as kind, rp.entry_date, rp.cost as amount,
      rt.name as item_name, rp.total_qty_kg as quantity_kg, rp.price_per_kg,
      null::text as payment_mode, null::text as payment_app, null::text as paid_to, null::text as reference_no,
      null::text as bank_account, null::text as paid_by, rp.notes as note, rp.created_at
    from raw_material_purchases rp
    left join raw_material_types rt on rt.id = rp.raw_material_type_id
    where p_party_type = 'supplier' and rp.supplier_id = p_party_id and rp.cost is not null

    union all

    select
      r.id, 'return', r.return_date,
      purchase_return_amount(r.quantity_kg, rp.price_per_kg, rp.cost, rp.total_qty_kg),
      rt.name, r.quantity_kg,
      coalesce(rp.price_per_kg, case when rp.total_qty_kg > 0 then round(rp.cost / rp.total_qty_kg, 2) end),
      null, null, null, null, null, null, r.reason, r.created_at
    from raw_material_purchase_returns r
    join raw_material_purchases rp on rp.id = r.purchase_id
    left join raw_material_types rt on rt.id = rp.raw_material_type_id
    where p_party_type = 'supplier' and rp.supplier_id = p_party_id and rp.cost is not null

    union all

    select
      sp.id, 'purchase', sp.entry_date, sp.cost,
      st.name, sp.quantity_kg, sp.price_per_kg,
      null, null, null, null, null, null, sp.notes, sp.created_at
    from scrap_purchases sp
    left join scrap_types st on st.id = sp.scrap_type_id
    where p_party_type = 'scrap_dealer' and sp.scrap_dealer_id = p_party_id and sp.cost is not null

    union all

    select
      t.id, t.type, t.date, t.amount,
      null, null, null,
      t.payment_mode, t.payment_app, t.paid_to, t.reference_no, t.bank_account, t.paid_by, t.note, t.created_at
    from supplier_ledger_transactions t
    where t.party_type = p_party_type
      and coalesce(t.supplier_id, t.scrap_dealer_id) = p_party_id
  )
  select
    id, kind, entry_date, amount,
    sum(case when kind in ('payment', 'return') then -amount else amount end)
      over (order by entry_date, created_at, id rows between unbounded preceding and current row) as running_balance,
    item_name, quantity_kg, price_per_kg,
    payment_mode, payment_app, paid_to, reference_no, bank_account, paid_by, note, created_at
  from events
  order by entry_date desc, created_at desc, id desc;
$$;

-- =========================================================================
-- 8. Weekly stock check report — one row per (count period, material).
--
-- FIFO is computed on cumulative positions rather than lot by lot:
--   C(t) = everything that came in up to t − what was counted at t
-- is the total consumed so far, and a period's consumption is the slice of
-- the lot sequence between C(previous count) and C(this count). A lot's
-- share of that slice is its overlap with it, times its rate.
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
  -- Scrap purchase lots, per scrap type, in arrival order.
  scrap_lots as (
    select
      sp.scrap_type_id,
      coalesce(sp.price_per_kg, case when sp.quantity_kg > 0 then sp.cost / sp.quantity_kg end, 0) as rate,
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
  purchase_lots as (
    select
      rp.raw_material_type_id as material_id, rp.entry_date as lot_date, rp.created_at, rp.id,
      rp.total_qty_kg - coalesce(r.kg, 0) as qty,
      coalesce(rp.price_per_kg, case when rp.total_qty_kg > 0 then rp.cost / rp.total_qty_kg end) as rate
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

-- Produced goods for the same periods: one row per (count period, pipe size).
create or replace function rpc_stock_check_production(p_from date, p_to date)
returns table (
  count_id uuid,
  pipe_product_id uuid,
  diameter_inches numeric,
  weight_kg numeric,
  pcs numeric,
  kg numeric
)
language sql stable as $$
  with counts as (
    select id, count_date, lag(count_date) over (order by count_date) as prev_count_date
    from stock_counts
  )
  select
    c.id, pp.id, pp.diameter_inches, pp.weight_kg,
    sum(pe.quantity), sum(pe.quantity * pp.weight_kg)
  from counts c
  join production_entries pe
    on pe.entry_date > c.prev_count_date and pe.entry_date <= c.count_date
  join pipe_products pp on pp.id = pe.pipe_product_id
  where c.prev_count_date is not null
    and c.count_date between p_from and p_to
  group by c.id, pp.id, pp.diameter_inches, pp.weight_kg
  order by pp.diameter_inches, pp.weight_kg;
$$;

revoke execute on function rpc_stock_check_report(date, date) from public;
revoke execute on function rpc_stock_check_production(date, date) from public;
grant execute on function rpc_stock_check_report(date, date) to authenticated;
grant execute on function rpc_stock_check_production(date, date) to authenticated;

-- The most each material could have at the end of a date if none was used:
-- the latest earlier count plus everything that came in since, or plain
-- inflow when it has never been counted. Shown next to each line while
-- counting, so the kg used (and any count that is too high) is visible
-- before saving.
create or replace function rpc_expected_raw_material_stock(p_date date)
returns table (raw_material_type_id uuid, expected_kg numeric)
language sql stable as $$
  select
    t.id,
    case
      when lc.count_date is null then raw_material_inflow_kg(t.id, p_date)
      else lc.quantity_kg + raw_material_inflow_kg(t.id, p_date) - raw_material_inflow_kg(t.id, lc.count_date)
    end
  from raw_material_types t
  left join lateral (
    select sc.count_date, ci.quantity_kg
    from stock_count_items ci
    join stock_counts sc on sc.id = ci.count_id
    where ci.raw_material_type_id = t.id and sc.count_date < p_date
    order by sc.count_date desc
    limit 1
  ) lc on true;
$$;

revoke execute on function rpc_expected_raw_material_stock(date) from public;
grant execute on function rpc_expected_raw_material_stock(date) to authenticated;
