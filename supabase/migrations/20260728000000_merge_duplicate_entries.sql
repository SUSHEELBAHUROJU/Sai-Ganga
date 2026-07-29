-- Same-day entries for the same product must merge (add) instead of forming
-- duplicate rows. This adds the DB-level guarantee (unique constraint) plus
-- atomic "add quantity" RPCs the Add Production / Add Sale screens call, so
-- duplicates cannot be created even by concurrent or accidental double-saves.
--
-- Editing an existing row in Records/History is unaffected: it still does a
-- plain UPDATE (SET, not add) via PostgREST — see useRecordMutations.ts.

-- ---------------------------------------------------------------------------
-- 1. Merge any existing duplicates before the constraint can reject them.
-- ---------------------------------------------------------------------------

with grouped as (
  select entry_date, pipe_product_id,
         sum(quantity) as total_qty,
         (array_agg(id order by created_at))[1] as keep_id
  from production_entries
  group by entry_date, pipe_product_id
  having count(*) > 1
)
update production_entries pe
set quantity = g.total_qty, updated_at = now()
from grouped g
where pe.id = g.keep_id;

delete from production_entries pe
using (
  select entry_date, pipe_product_id, (array_agg(id order by created_at))[1] as keep_id
  from production_entries
  group by entry_date, pipe_product_id
  having count(*) > 1
) g
where pe.entry_date = g.entry_date
  and pe.pipe_product_id = g.pipe_product_id
  and pe.id != g.keep_id;

-- Sales: same idea, but the match key includes customer_id. A NULL
-- customer_id is never equal to another NULL under the unique constraint
-- we're about to add, so only merge groups where customer_id IS NOT NULL —
-- merging NULL-customer rows here would consolidate legitimately distinct
-- anonymous sales that the constraint itself will never touch.
with grouped as (
  select entry_date, pipe_product_id, customer_id,
         sum(quantity) as total_qty,
         (array_agg(id order by created_at))[1] as keep_id
  from sales_entries
  where customer_id is not null
  group by entry_date, pipe_product_id, customer_id
  having count(*) > 1
)
update sales_entries se
set quantity = g.total_qty, updated_at = now()
from grouped g
where se.id = g.keep_id;

delete from sales_entries se
using (
  select entry_date, pipe_product_id, customer_id, (array_agg(id order by created_at))[1] as keep_id
  from sales_entries
  where customer_id is not null
  group by entry_date, pipe_product_id, customer_id
  having count(*) > 1
) g
where se.entry_date = g.entry_date
  and se.pipe_product_id = g.pipe_product_id
  and se.customer_id = g.customer_id
  and se.id != g.keep_id;

-- ---------------------------------------------------------------------------
-- 2. Unique constraints — the hard guarantee against duplicates.
-- ---------------------------------------------------------------------------

alter table production_entries
  add constraint production_entries_date_product_unique unique (entry_date, pipe_product_id);

alter table sales_entries
  add constraint sales_entries_date_product_customer_unique unique (entry_date, pipe_product_id, customer_id);

-- ---------------------------------------------------------------------------
-- 3. Atomic "add to existing, else insert" RPCs.
-- SECURITY INVOKER (the default) so RLS still applies as the calling role.
-- ---------------------------------------------------------------------------

create or replace function add_production_quantity(
  p_entry_date date,
  p_pipe_product_id uuid,
  p_quantity numeric,
  p_notes text default null
) returns production_entries
language plpgsql
as $$
declare
  v_row production_entries;
begin
  insert into production_entries (entry_date, pipe_product_id, quantity, notes)
  values (p_entry_date, p_pipe_product_id, p_quantity, p_notes)
  on conflict (entry_date, pipe_product_id)
  do update set
    quantity = production_entries.quantity + excluded.quantity,
    notes = coalesce(excluded.notes, production_entries.notes),
    updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function add_sales_quantity(
  p_entry_date date,
  p_pipe_product_id uuid,
  p_customer_id uuid,
  p_quantity numeric,
  p_notes text default null
) returns sales_entries
language plpgsql
as $$
declare
  v_row sales_entries;
begin
  insert into sales_entries (entry_date, pipe_product_id, customer_id, quantity, notes)
  values (p_entry_date, p_pipe_product_id, p_customer_id, p_quantity, p_notes)
  on conflict (entry_date, pipe_product_id, customer_id)
  do update set
    quantity = sales_entries.quantity + excluded.quantity,
    notes = coalesce(excluded.notes, sales_entries.notes),
    updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

grant execute on function add_production_quantity(date, uuid, numeric, text) to anon, authenticated;
grant execute on function add_sales_quantity(date, uuid, uuid, numeric, text) to anon, authenticated;
