-- Voiding a bill left the pipes it consumed permanently deducted from
-- stock: useVoidBill only flips bills.status to 'voided' — it never touches
-- sales_entries — and finished_goods_stock (plus every "sold" total on
-- Reports/Dashboard) summed sales_entries.quantity with no regard for the
-- bill it belonged to.
--
-- Fixed the same way the ledger side already handles this (see
-- 20260801000000_customer_ledger.sql: customer_ledger_balance /
-- bill_payment_status filter to status = 'active') — a live read-side
-- filter, not a data mutation. Deleting the sales_entries rows instead would
-- also delete the only way to reopen a voided bill: Records groups a sale by
-- its bill_id, and useBills() (a plain list of every bill) isn't wired to
-- any screen, so the sale group / bill-number chip in Records is the sole
-- path to BillPdfModal. A sale with no bill_id (bill_id is null) is
-- unaffected either way — it was never billed, so there's nothing to void.

-- =========================================================================
-- 1. finished_goods_stock — sold_qty excludes sales on a voided bill
-- =========================================================================
create or replace view finished_goods_stock
  with (security_invoker = true) as
select
  p.id as pipe_product_id,
  p.diameter_inches,
  p.weight_kg,
  p.is_active,
  coalesce(ob.quantity, 0) as opening_qty,
  coalesce(prod.total, 0) as produced_qty,
  0::numeric as recycled_produced_qty,
  coalesce(sold.total, 0) as sold_qty,
  coalesce(ob.quantity, 0) + coalesce(prod.total, 0) - coalesce(sold.total, 0)
    as current_stock,
  lst.min_quantity as low_stock_threshold,
  lst.min_quantity is not null
    and (
      coalesce(ob.quantity, 0) + coalesce(prod.total, 0) - coalesce(sold.total, 0)
    ) < lst.min_quantity
    as is_low_stock
from pipe_products p
left join opening_balances ob on ob.item_type = 'pipe_product' and ob.item_id = p.id
left join (
  select pipe_product_id, sum(quantity) as total from production_entries group by pipe_product_id
) prod on prod.pipe_product_id = p.id
left join (
  select e.pipe_product_id, sum(e.quantity) as total
  from sales_entries e
  left join bills b on b.id = e.bill_id
  where b.id is null or b.status = 'active'
  group by e.pipe_product_id
) sold on sold.pipe_product_id = p.id
left join low_stock_thresholds lst on lst.item_type = 'pipe_product' and lst.item_id = p.id;

-- =========================================================================
-- 2. Report/dashboard "sold" aggregates — same exclusion, so a voided sale
--    can't show as stock-back-in-hand on one screen and still "sold today"
--    on another.
-- =========================================================================

create or replace function rpc_sales_totals_by_product(p_from date, p_to date)
returns table (
  pipe_product_id uuid,
  diameter_inches numeric,
  weight_kg numeric,
  total_pcs numeric
)
language sql stable as $$
  select p.id, p.diameter_inches, p.weight_kg, sum(e.quantity) as total_pcs
  from sales_entries e
  join pipe_products p on p.id = e.pipe_product_id
  left join bills b on b.id = e.bill_id
  where e.entry_date between p_from and p_to
    and (b.id is null or b.status = 'active')
  group by p.id, p.diameter_inches, p.weight_kg;
$$;

create or replace function rpc_sales_totals_by_customer_product(p_from date, p_to date)
returns table (
  customer_id uuid,
  customer_name text,
  pipe_product_id uuid,
  diameter_inches numeric,
  weight_kg numeric,
  total_pcs numeric
)
language sql stable as $$
  select s.customer_id, coalesce(c.name, 'No customer') as customer_name,
         p.id, p.diameter_inches, p.weight_kg, sum(s.quantity) as total_pcs
  from sales_entries s
  join pipe_products p on p.id = s.pipe_product_id
  left join customers c on c.id = s.customer_id
  left join bills b on b.id = s.bill_id
  where s.entry_date between p_from and p_to
    and (b.id is null or b.status = 'active')
  group by s.customer_id, c.name, p.id, p.diameter_inches, p.weight_kg;
$$;

create or replace function rpc_daily_series(p_from date, p_to date)
returns table (entry_date date, produced_kg numeric, sold_kg numeric)
language sql stable as $$
  select gs.entry_date,
    coalesce(prod.kg, 0) as produced_kg,
    coalesce(sold.kg, 0) as sold_kg
  from generate_series(p_from, p_to, interval '1 day') as gs(entry_date)
  left join (
    select e.entry_date, sum(e.quantity * p.weight_kg) as kg
    from production_entries e
    join pipe_products p on p.id = e.pipe_product_id
    where e.entry_date between p_from and p_to
    group by e.entry_date
  ) prod on prod.entry_date = gs.entry_date::date
  left join (
    select e.entry_date, sum(e.quantity * p.weight_kg) as kg
    from sales_entries e
    join pipe_products p on p.id = e.pipe_product_id
    left join bills b on b.id = e.bill_id
    where e.entry_date between p_from and p_to
      and (b.id is null or b.status = 'active')
    group by e.entry_date
  ) sold on sold.entry_date = gs.entry_date::date
  order by gs.entry_date;
$$;

create or replace function rpc_today_summary(p_date date)
returns table (
  produced_pcs numeric,
  produced_kg numeric,
  sold_pcs numeric,
  sold_kg numeric,
  purchase_count bigint,
  recycling_output_kg numeric
)
language sql stable as $$
  select
    coalesce((select sum(e.quantity) from production_entries e where e.entry_date = p_date), 0),
    coalesce((select sum(e.quantity * p.weight_kg) from production_entries e
        join pipe_products p on p.id = e.pipe_product_id where e.entry_date = p_date), 0),
    coalesce((
      select sum(e.quantity) from sales_entries e
      left join bills b on b.id = e.bill_id
      where e.entry_date = p_date and (b.id is null or b.status = 'active')
    ), 0),
    coalesce((
      select sum(e.quantity * p.weight_kg) from sales_entries e
      join pipe_products p on p.id = e.pipe_product_id
      left join bills b on b.id = e.bill_id
      where e.entry_date = p_date and (b.id is null or b.status = 'active')
    ), 0),
    coalesce((select count(*) from raw_material_purchases where entry_date = p_date), 0)
      + coalesce((select count(*) from scrap_purchases where entry_date = p_date), 0),
    coalesce((select sum(total_output_kg) from recycling_entries where entry_date = p_date), 0);
$$;
