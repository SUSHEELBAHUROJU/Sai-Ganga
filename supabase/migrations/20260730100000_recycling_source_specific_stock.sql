-- Recycled Granules stock is now split by source material.
-- "Recycled LD Pipe" ← output from "Old LDPE Pipe" source.
-- "Recycled Drip Pipe" ← output from "Drip Pipe" source.
-- Scrap consumed is no longer tracked. Direct-to-pipe mode is removed.

-- =========================================================================
-- 1. Link raw_material_types to their scrap source
-- =========================================================================

alter table raw_material_types
  add column linked_scrap_type_id uuid references scrap_types(id);

-- Drop the old "only one recycled_output" constraint — we now have two.
drop index if exists raw_material_types_one_recycled_output;

-- Deactivate the old single "Recycled Granules" row.
update raw_material_types set is_active = false where name = 'Recycled Granules';

-- Insert the two new source-specific recycled output types.
insert into raw_material_types (name, is_recycled_output, linked_scrap_type_id, default_pack_kg)
values
  ('Recycled LD Pipe', true,
    (select id from scrap_types where name = 'Old LDPE Pipe'),
    25),
  ('Recycled Drip Pipe', true,
    (select id from scrap_types where name = 'Drip Pipe'),
    25)
on conflict (name) do update set
  is_recycled_output = true,
  linked_scrap_type_id = excluded.linked_scrap_type_id,
  is_active = true;

-- =========================================================================
-- 2. Drop scrap_consumed_kg from recycling_entries
-- =========================================================================

-- First drop the scrap_stock view that references scrap_consumed_kg
drop view if exists scrap_stock;

alter table recycling_entries drop column scrap_consumed_kg;

-- =========================================================================
-- 3. Remove direct_to_pipe plumbing
-- =========================================================================

-- Drop the merge-by-date RPC for direct-to-pipe recycling.
drop function if exists add_recycling_direct_to_pipe(date, uuid, uuid, numeric, numeric, text);

-- Drop the partial unique index for direct-to-pipe merging.
drop index if exists recycling_entries_direct_to_pipe_date_product_unique;

-- Drop the old consistency check.
alter table recycling_entries drop constraint if exists recycling_entries_output_consistency_check;

-- Constrain output_mode to only 'granules' going forward.
-- Existing 'direct_to_pipe' rows are kept but can no longer be created.
alter table recycling_entries
  add constraint recycling_entries_output_consistency_check
  check (
    output_mode = 'granules'
    and total_output_kg is not null
    and pipe_product_id is null
    and pipe_quantity is null
    and (
      (output_entry_mode = 'bag' and output_pack_kg is not null and num_bags is not null)
      or
      (output_entry_mode = 'direct_kg' and output_pack_kg is null and num_bags is null)
    )
  ) not valid;  -- NOT VALID so existing direct_to_pipe rows don't block migration

-- =========================================================================
-- 4. Rebuild all stock views
-- =========================================================================

drop view if exists finished_goods_stock;
drop view if exists raw_material_stock;
-- scrap_stock was already dropped above

-- Finished goods stock: opening + produced - sold
-- (recycled direct-to-pipe contribution removed)
create view finished_goods_stock
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
  select pipe_product_id, sum(quantity) as total from sales_entries group by pipe_product_id
) sold on sold.pipe_product_id = p.id
left join low_stock_thresholds lst on lst.item_type = 'pipe_product' and lst.item_id = p.id;

grant select on finished_goods_stock to anon, authenticated;

-- Raw material stock: opening + purchased + recycled output (per source)
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
left join (
  select source_scrap_type_id, sum(total_output_kg) as total
  from recycling_entries
  where output_mode = 'granules'
  group by source_scrap_type_id
) recy on t.is_recycled_output and recy.source_scrap_type_id = t.linked_scrap_type_id
left join low_stock_thresholds lst on lst.item_type = 'raw_material' and lst.item_id = t.id;

grant select on raw_material_stock to anon, authenticated;

-- Scrap stock: opening + purchased + factory waste
-- (consumed column removed — scrap consumption is no longer tracked)
create view scrap_stock
  with (security_invoker = true) as
select
  t.id as scrap_type_id,
  t.name,
  t.is_active,
  coalesce(ob.quantity, 0) as opening_kg,
  coalesce(sp.total, 0) as purchased_kg,
  coalesce(fw.total, 0) as factory_waste_kg,
  0::numeric as consumed_kg,
  coalesce(ob.quantity, 0) + coalesce(sp.total, 0) + coalesce(fw.total, 0)
    as current_stock,
  lst.min_quantity as low_stock_threshold,
  lst.min_quantity is not null
    and (
      coalesce(ob.quantity, 0) + coalesce(sp.total, 0) + coalesce(fw.total, 0)
    ) < lst.min_quantity
    as is_low_stock
from scrap_types t
left join opening_balances ob on ob.item_type = 'scrap' and ob.item_id = t.id
left join (
  select scrap_type_id, sum(quantity_kg) as total from scrap_purchases group by scrap_type_id
) sp on sp.scrap_type_id = t.id
left join (
  select scrap_type_id, sum(quantity_kg) as total from factory_waste_entries group by scrap_type_id
) fw on fw.scrap_type_id = t.id
left join low_stock_thresholds lst on lst.item_type = 'scrap' and lst.item_id = t.id;

grant select on scrap_stock to anon, authenticated;
