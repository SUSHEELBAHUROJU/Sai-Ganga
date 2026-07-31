-- Performance & reliability pass for the Supabase free tier (500MB DB,
-- ~5GB egress/month, limited concurrent connections). Two changes:
--
-- 1. Indexes on columns Reports/Records actually filter/join/group by that
--    weren't covered yet (pipe_product_id on the two high-volume entry
--    tables, plus composite date+product for the new aggregation RPCs below).
--
-- 2. Aggregation RPCs: Reports (Daily Summary, Trend) previously fetched
--    every matching row to the browser and summed them in JavaScript. Over
--    a date range up to MAX_QUERY_RANGE_DAYS (366 days), that's every entry
--    for a year downloaded just to show a handful of totals. These RPCs do
--    the SUM/GROUP BY in Postgres and return only the aggregated rows —
--    the same "ask the database for the number" pattern already used by
--    the finished_goods_stock / raw_material_stock / scrap_stock views.

-- =========================================================================
-- 1. Indexes
-- =========================================================================

create index if not exists idx_production_entries_product on production_entries (pipe_product_id);
create index if not exists idx_sales_entries_product on sales_entries (pipe_product_id);

create index if not exists idx_production_entries_date_product
  on production_entries (entry_date, pipe_product_id);
create index if not exists idx_sales_entries_date_product
  on sales_entries (entry_date, pipe_product_id);
create index if not exists idx_sales_entries_date_customer
  on sales_entries (entry_date, customer_id);

create index if not exists idx_bills_customer on bills (customer_id);
create index if not exists idx_bills_date on bills (bill_date desc);

-- =========================================================================
-- 2. Aggregation RPCs
-- security invoker (the default) so these still run under the caller's own
-- RLS — same "must be signed in" policy as everything else, no bypass.
-- =========================================================================

create or replace function rpc_production_totals_by_product(p_from date, p_to date)
returns table (
  pipe_product_id uuid,
  diameter_inches numeric,
  weight_kg numeric,
  total_pcs numeric
)
language sql stable as $$
  select p.id, p.diameter_inches, p.weight_kg, sum(e.quantity) as total_pcs
  from production_entries e
  join pipe_products p on p.id = e.pipe_product_id
  where e.entry_date between p_from and p_to
  group by p.id, p.diameter_inches, p.weight_kg;
$$;

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
  where e.entry_date between p_from and p_to
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
  where s.entry_date between p_from and p_to
  group by s.customer_id, c.name, p.id, p.diameter_inches, p.weight_kg;
$$;

create or replace function rpc_raw_purchases_by_type(p_from date, p_to date)
returns table (label text, quantity numeric)
language sql stable as $$
  select coalesce(t.name, 'Unknown material') as label, sum(rp.total_qty_kg) as quantity
  from raw_material_purchases rp
  left join raw_material_types t on t.id = rp.raw_material_type_id
  where rp.entry_date between p_from and p_to
  group by t.name
  order by sum(rp.total_qty_kg) desc;
$$;

-- Single-row bundle of the small scalar sums both Daily Summary and Trend
-- need (recycling output, factory waste, raw/scrap purchase totals) — one
-- round trip instead of up to four.
create or replace function rpc_report_sums(p_from date, p_to date)
returns table (
  recycling_output_kg numeric,
  recycling_entry_count bigint,
  factory_waste_kg numeric,
  raw_purchased_kg numeric,
  scrap_purchased_kg numeric
)
language sql stable as $$
  select
    coalesce((select sum(total_output_kg) from recycling_entries where entry_date between p_from and p_to), 0),
    coalesce((select count(*) from recycling_entries where entry_date between p_from and p_to), 0),
    coalesce((select sum(quantity_kg) from factory_waste_entries where entry_date between p_from and p_to), 0),
    coalesce((select sum(total_qty_kg) from raw_material_purchases where entry_date between p_from and p_to), 0),
    coalesce((select sum(quantity_kg) from scrap_purchases where entry_date between p_from and p_to), 0);
$$;

-- Zero-filled per-day produced/sold kg series for the Trend chart — the one
-- query that used to require every production/sales row in the whole range.
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
    where e.entry_date between p_from and p_to
    group by e.entry_date
  ) sold on sold.entry_date = gs.entry_date::date
  order by gs.entry_date;
$$;

-- Dashboard "today" tile — collapses 5 separate queries into 1 round trip.
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
    coalesce((select sum(e.quantity) from sales_entries e where e.entry_date = p_date), 0),
    coalesce((select sum(e.quantity * p.weight_kg) from sales_entries e
        join pipe_products p on p.id = e.pipe_product_id where e.entry_date = p_date), 0),
    coalesce((select count(*) from raw_material_purchases where entry_date = p_date), 0)
      + coalesce((select count(*) from scrap_purchases where entry_date = p_date), 0),
    coalesce((select sum(total_output_kg) from recycling_entries where entry_date = p_date), 0);
$$;

-- =========================================================================
-- Grants — mirror 20260731000000's stance: nothing for anon, explicit for
-- authenticated. New functions default-grant EXECUTE to PUBLIC (which anon
-- inherits) unless revoked, so do that explicitly rather than relying on
-- the blanket revoke in the earlier migration having anticipated these.
-- =========================================================================

revoke execute on function rpc_production_totals_by_product(date, date) from public;
revoke execute on function rpc_sales_totals_by_product(date, date) from public;
revoke execute on function rpc_sales_totals_by_customer_product(date, date) from public;
revoke execute on function rpc_raw_purchases_by_type(date, date) from public;
revoke execute on function rpc_report_sums(date, date) from public;
revoke execute on function rpc_daily_series(date, date) from public;
revoke execute on function rpc_today_summary(date) from public;

grant execute on function rpc_production_totals_by_product(date, date) to authenticated;
grant execute on function rpc_sales_totals_by_product(date, date) to authenticated;
grant execute on function rpc_sales_totals_by_customer_product(date, date) to authenticated;
grant execute on function rpc_raw_purchases_by_type(date, date) to authenticated;
grant execute on function rpc_report_sums(date, date) to authenticated;
grant execute on function rpc_daily_series(date, date) to authenticated;
grant execute on function rpc_today_summary(date) to authenticated;
