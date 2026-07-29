-- Automatic stock calculation layer. Stock is always derived from opening
-- balances plus recorded entries — never entered manually — so these views
-- are the single source of truth any screen can query directly.

-- Robustly identify which raw material type represents recycled granule
-- output (rather than matching on the seeded name, which the user can
-- rename via Settings). Exactly one type may be flagged as such.
alter table raw_material_types add column is_recycled_output boolean not null default false;
update raw_material_types set is_recycled_output = true where name = 'Recycled Granules';
create unique index raw_material_types_one_recycled_output
  on raw_material_types (is_recycled_output)
  where is_recycled_output;

-- Scrap is a single pool with no master-data row of its own, so opening
-- balances / thresholds for it are keyed by a fixed sentinel item_id
-- (see src/lib/constants.ts SCRAP_POOL_ID) under item_type = 'scrap'.
alter table opening_balances drop constraint opening_balances_item_type_check;
alter table opening_balances
  add constraint opening_balances_item_type_check
  check (item_type in ('pipe_product', 'raw_material', 'scrap'));

alter table low_stock_thresholds drop constraint low_stock_thresholds_item_type_check;
alter table low_stock_thresholds
  add constraint low_stock_thresholds_item_type_check
  check (item_type in ('pipe_product', 'raw_material', 'scrap'));

-- Finished goods stock per pipe product:
--   opening + produced - sold
create view finished_goods_stock
  with (security_invoker = true) as
select
  p.id as pipe_product_id,
  p.diameter_inches,
  p.weight_kg,
  p.is_active,
  coalesce(ob.quantity, 0) as opening_qty,
  coalesce(prod.total, 0) as produced_qty,
  coalesce(sold.total, 0) as sold_qty,
  coalesce(ob.quantity, 0) + coalesce(prod.total, 0) - coalesce(sold.total, 0) as current_stock,
  lst.min_quantity as low_stock_threshold,
  lst.min_quantity is not null
    and (coalesce(ob.quantity, 0) + coalesce(prod.total, 0) - coalesce(sold.total, 0)) < lst.min_quantity
    as is_low_stock
from pipe_products p
left join opening_balances ob on ob.item_type = 'pipe_product' and ob.item_id = p.id
left join (
  select pipe_product_id, sum(quantity) as total from production_entries group by pipe_product_id
) prod on prod.pipe_product_id = p.id
left join (
  select pipe_product_id, sum(quantity) as total from sales_entries group by pipe_product_id
) sold on sold.pipe_product_id = p.id
left join low_stock_thresholds lst on lst.item_type = 'pipe_product' and lst.item_id = p.id;

grant select on finished_goods_stock to anon, authenticated;

-- Raw material / granule stock per type:
--   opening + purchased + (recycled output, only for the flagged type)
-- Production does not yet consume raw material (not tracked) — when it
-- does, subtract a `consumed_in_production_kg` term here.
create view raw_material_stock
  with (security_invoker = true) as
select
  t.id as raw_material_type_id,
  t.name,
  t.is_active,
  t.is_recycled_output,
  coalesce(ob.quantity, 0) as opening_kg,
  coalesce(purch.total, 0) as purchased_kg,
  case when t.is_recycled_output then coalesce(recy.total, 0) else 0 end as recycled_output_kg,
  coalesce(ob.quantity, 0) + coalesce(purch.total, 0)
    + case when t.is_recycled_output then coalesce(recy.total, 0) else 0 end as current_stock,
  lst.min_quantity as low_stock_threshold,
  lst.min_quantity is not null
    and (
      coalesce(ob.quantity, 0) + coalesce(purch.total, 0)
      + case when t.is_recycled_output then coalesce(recy.total, 0) else 0 end
    ) < lst.min_quantity
    as is_low_stock
from raw_material_types t
left join opening_balances ob on ob.item_type = 'raw_material' and ob.item_id = t.id
left join (
  select raw_material_type_id, sum(total_qty_kg) as total
  from raw_material_purchases
  group by raw_material_type_id
) purch on purch.raw_material_type_id = t.id
left join (select sum(total_output_kg) as total from recycling_entries) recy on true
left join low_stock_thresholds lst on lst.item_type = 'raw_material' and lst.item_id = t.id;

grant select on raw_material_stock to anon, authenticated;

-- Scrap stock (single pool, kg):
--   opening + purchased + factory waste - consumed in recycling
create view scrap_stock
  with (security_invoker = true) as
select
  coalesce(ob.quantity, 0) as opening_kg,
  coalesce(sp.total, 0) as purchased_kg,
  coalesce(fw.total, 0) as factory_waste_kg,
  coalesce(re.total, 0) as consumed_kg,
  coalesce(ob.quantity, 0) + coalesce(sp.total, 0) + coalesce(fw.total, 0) - coalesce(re.total, 0)
    as current_stock,
  lst.min_quantity as low_stock_threshold,
  lst.min_quantity is not null
    and (
      coalesce(ob.quantity, 0) + coalesce(sp.total, 0) + coalesce(fw.total, 0) - coalesce(re.total, 0)
    ) < lst.min_quantity
    as is_low_stock
from (select 1) as singleton
left join opening_balances ob
  on ob.item_type = 'scrap' and ob.item_id = '00000000-0000-0000-0000-000000000000'
left join (select sum(quantity_kg) as total from scrap_purchases) sp on true
left join (select sum(quantity_kg) as total from factory_waste_entries) fw on true
left join (select sum(scrap_consumed_kg) as total from recycling_entries) re on true
left join low_stock_thresholds lst
  on lst.item_type = 'scrap' and lst.item_id = '00000000-0000-0000-0000-000000000000';

grant select on scrap_stock to anon, authenticated;
