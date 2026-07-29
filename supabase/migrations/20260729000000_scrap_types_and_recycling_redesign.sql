-- Scrap becomes typed (e.g. "Old LDPE Pipe", "Drip Pipe") instead of one
-- combined pool, and recycling entries record a source material rather than
-- an exact scrap weight (usually not known precisely), with output going to
-- either Recycled Granules or straight to a finished pipe product.

-- =========================================================================
-- Scrap Types — new master-data list, same pattern as raw_material_types.
-- =========================================================================

create table scrap_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on scrap_types
  for each row execute function set_updated_at();

alter table scrap_types enable row level security;
create policy "allow all (phase 1, single user)" on scrap_types for all using (true) with check (true);
grant select, insert, update, delete on scrap_types to anon, authenticated;

insert into scrap_types (name) values ('Old LDPE Pipe'), ('Drip Pipe')
on conflict (name) do nothing;

-- =========================================================================
-- Scrap Purchases / Factory Waste now add to a specific scrap type's stock.
-- Existing rows (if any) are backfilled onto the first scrap type so the
-- NOT NULL constraint can be added without losing history.
-- =========================================================================

alter table scrap_purchases add column scrap_type_id uuid references scrap_types(id);
alter table factory_waste_entries add column scrap_type_id uuid references scrap_types(id);

update scrap_purchases set scrap_type_id = (select id from scrap_types order by name limit 1)
  where scrap_type_id is null;
update factory_waste_entries set scrap_type_id = (select id from scrap_types order by name limit 1)
  where scrap_type_id is null;

alter table scrap_purchases alter column scrap_type_id set not null;
alter table factory_waste_entries alter column scrap_type_id set not null;

create index idx_scrap_purchases_type on scrap_purchases (scrap_type_id);
create index idx_factory_waste_entries_type on factory_waste_entries (scrap_type_id);

-- =========================================================================
-- Recycling entries redesign:
--  - source_scrap_type_id replaces the old scrap_source origin chip — the
--    business now identifies WHICH material was recycled, not where it came
--    from (that's already tracked at purchase/waste time).
--  - scrap_consumed_kg becomes optional: precise weight often isn't known.
--  - output_mode chooses, per entry, between granules output (existing
--    behaviour) and going straight to a finished pipe product.
-- =========================================================================

alter table recycling_entries drop column scrap_source;

alter table recycling_entries add column source_scrap_type_id uuid references scrap_types(id);
update recycling_entries set source_scrap_type_id = (select id from scrap_types order by name limit 1)
  where source_scrap_type_id is null;
alter table recycling_entries alter column source_scrap_type_id set not null;

alter table recycling_entries alter column scrap_consumed_kg drop not null;

alter table recycling_entries add column output_mode text not null default 'granules'
  check (output_mode in ('granules', 'direct_to_pipe'));
alter table recycling_entries alter column output_mode drop default;

alter table recycling_entries alter column output_entry_mode drop not null;
alter table recycling_entries alter column output_entry_mode drop default;
alter table recycling_entries alter column total_output_kg drop not null;

alter table recycling_entries add column pipe_product_id uuid references pipe_products(id);
alter table recycling_entries add column pipe_quantity numeric(10,2);

alter table recycling_entries drop constraint recycling_entries_output_mode_fields_check;

alter table recycling_entries
  add constraint recycling_entries_output_consistency_check
  check (
    (
      output_mode = 'granules'
      and total_output_kg is not null
      and pipe_product_id is null
      and pipe_quantity is null
      and (
        (output_entry_mode = 'bag' and output_pack_kg is not null and num_bags is not null)
        or
        (output_entry_mode = 'direct_kg' and output_pack_kg is null and num_bags is null)
      )
    )
    or
    (
      output_mode = 'direct_to_pipe'
      and pipe_product_id is not null
      and pipe_quantity is not null
      and pipe_quantity > 0
      and total_output_kg is null
      and output_entry_mode is null
      and output_pack_kg is null
      and num_bags is null
    )
  );

create index idx_recycling_entries_source_type on recycling_entries (source_scrap_type_id);
create index idx_recycling_entries_pipe_product on recycling_entries (pipe_product_id);

-- Same-day direct-to-pipe recycling for the same product merges (adds) into
-- one row, mirroring production_entries — so it combines correctly with any
-- pipe production already logged that day. Granules-mode rows are unaffected
-- (never merged; kept one row per entry, as before).
create unique index recycling_entries_direct_to_pipe_date_product_unique
  on recycling_entries (entry_date, pipe_product_id)
  where output_mode = 'direct_to_pipe';

create or replace function add_recycling_direct_to_pipe(
  p_entry_date date,
  p_pipe_product_id uuid,
  p_source_scrap_type_id uuid,
  p_pipe_quantity numeric,
  p_scrap_consumed_kg numeric default null,
  p_notes text default null
) returns recycling_entries language plpgsql as $$
declare v_row recycling_entries;
begin
  insert into recycling_entries (
    entry_date, output_mode, pipe_product_id, pipe_quantity,
    source_scrap_type_id, scrap_consumed_kg, notes
  )
  values (
    p_entry_date, 'direct_to_pipe', p_pipe_product_id, p_pipe_quantity,
    p_source_scrap_type_id, p_scrap_consumed_kg, p_notes
  )
  on conflict (entry_date, pipe_product_id) where output_mode = 'direct_to_pipe'
  do update set
    pipe_quantity = recycling_entries.pipe_quantity + excluded.pipe_quantity,
    scrap_consumed_kg = case
      when recycling_entries.scrap_consumed_kg is null and excluded.scrap_consumed_kg is null then null
      else coalesce(recycling_entries.scrap_consumed_kg, 0) + coalesce(excluded.scrap_consumed_kg, 0)
    end,
    source_scrap_type_id = excluded.source_scrap_type_id,
    notes = coalesce(excluded.notes, recycling_entries.notes),
    updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

grant execute on function add_recycling_direct_to_pipe(date, uuid, uuid, numeric, numeric, text)
  to anon, authenticated;

-- =========================================================================
-- Stock views — rebuilt (column shapes change, so replace rather than
-- CREATE OR REPLACE, which can only append trailing columns).
-- =========================================================================

drop view finished_goods_stock;
drop view raw_material_stock;
drop view scrap_stock;

-- Finished goods stock per pipe product:
--   opening + produced (normal production + recycled direct-to-pipe) - sold
create view finished_goods_stock
  with (security_invoker = true) as
select
  p.id as pipe_product_id,
  p.diameter_inches,
  p.weight_kg,
  p.is_active,
  coalesce(ob.quantity, 0) as opening_qty,
  coalesce(prod.total, 0) as produced_qty,
  coalesce(recy.total, 0) as recycled_produced_qty,
  coalesce(sold.total, 0) as sold_qty,
  coalesce(ob.quantity, 0) + coalesce(prod.total, 0) + coalesce(recy.total, 0) - coalesce(sold.total, 0)
    as current_stock,
  lst.min_quantity as low_stock_threshold,
  lst.min_quantity is not null
    and (
      coalesce(ob.quantity, 0) + coalesce(prod.total, 0) + coalesce(recy.total, 0) - coalesce(sold.total, 0)
    ) < lst.min_quantity
    as is_low_stock
from pipe_products p
left join opening_balances ob on ob.item_type = 'pipe_product' and ob.item_id = p.id
left join (
  select pipe_product_id, sum(quantity) as total from production_entries group by pipe_product_id
) prod on prod.pipe_product_id = p.id
left join (
  select pipe_product_id, sum(pipe_quantity) as total
  from recycling_entries
  where output_mode = 'direct_to_pipe'
  group by pipe_product_id
) recy on recy.pipe_product_id = p.id
left join (
  select pipe_product_id, sum(quantity) as total from sales_entries group by pipe_product_id
) sold on sold.pipe_product_id = p.id
left join low_stock_thresholds lst on lst.item_type = 'pipe_product' and lst.item_id = p.id;

grant select on finished_goods_stock to anon, authenticated;

-- Raw material / granule stock per type:
--   opening + purchased + (recycled granule output, only for the flagged type)
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
  select sum(total_output_kg) as total from recycling_entries where output_mode = 'granules'
) recy on true
left join low_stock_thresholds lst on lst.item_type = 'raw_material' and lst.item_id = t.id;

grant select on raw_material_stock to anon, authenticated;

-- Scrap stock, per scrap type (was a single combined pool):
--   opening + purchased + factory waste - consumed in recycling
create view scrap_stock
  with (security_invoker = true) as
select
  t.id as scrap_type_id,
  t.name,
  t.is_active,
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
from scrap_types t
left join opening_balances ob on ob.item_type = 'scrap' and ob.item_id = t.id
left join (
  select scrap_type_id, sum(quantity_kg) as total from scrap_purchases group by scrap_type_id
) sp on sp.scrap_type_id = t.id
left join (
  select scrap_type_id, sum(quantity_kg) as total from factory_waste_entries group by scrap_type_id
) fw on fw.scrap_type_id = t.id
left join (
  select source_scrap_type_id, sum(scrap_consumed_kg) as total
  from recycling_entries
  where scrap_consumed_kg is not null
  group by source_scrap_type_id
) re on re.source_scrap_type_id = t.id
left join low_stock_thresholds lst on lst.item_type = 'scrap' and lst.item_id = t.id;

grant select on scrap_stock to anon, authenticated;
