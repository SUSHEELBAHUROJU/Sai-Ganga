-- Production-readiness audit fixes.
--
-- 1) Server-side positivity checks — the frontend already validates quantity/
--    cost fields, but frontend checks can be bypassed (direct API calls, bugs
--    in a future screen). These constraints make the database itself reject
--    zero/negative/nonsensical numbers, regardless of caller.
-- 2) Atomic batch RPCs for multi-line saves — the existing per-line RPCs
--    (add_production_quantity / add_sales_quantity) are called once per cart
--    line via Promise.all from the client. If line 2 of 3 fails (e.g. the
--    network drops mid-save), lines 1 and 3 may already be committed while
--    the UI still shows all 3 as unsaved; retrying resubmits line 1 and 3
--    again, and since they ADD onto existing quantity, the retry silently
--    double-counts. Batching the whole cart into one plpgsql function call
--    makes the save atomic — Postgres rolls back the entire function if any
--    row in it fails, so a retry after a failure is always safe.

-- =========================================================================
-- Positivity checks
-- =========================================================================

alter table production_entries
  add constraint production_entries_quantity_positive check (quantity > 0);

alter table sales_entries
  add constraint sales_entries_quantity_positive check (quantity > 0);

alter table recycling_entries
  add constraint recycling_entries_scrap_consumed_positive
    check (scrap_consumed_kg is null or scrap_consumed_kg > 0),
  add constraint recycling_entries_total_output_positive
    check (total_output_kg is null or total_output_kg > 0),
  add constraint recycling_entries_output_pack_positive
    check (output_pack_kg is null or output_pack_kg > 0),
  add constraint recycling_entries_num_bags_positive
    check (num_bags is null or num_bags > 0);

alter table raw_material_purchases
  add constraint raw_material_purchases_total_qty_positive check (total_qty_kg > 0),
  add constraint raw_material_purchases_pack_kg_positive
    check (pack_kg is null or pack_kg > 0),
  add constraint raw_material_purchases_num_bags_positive
    check (num_bags is null or num_bags > 0),
  add constraint raw_material_purchases_cost_nonnegative
    check (cost is null or cost >= 0);

alter table scrap_purchases
  add constraint scrap_purchases_quantity_positive check (quantity_kg > 0),
  add constraint scrap_purchases_cost_nonnegative check (cost is null or cost >= 0);

alter table factory_waste_entries
  add constraint factory_waste_entries_quantity_positive check (quantity_kg > 0);

alter table opening_balances
  add constraint opening_balances_quantity_nonnegative check (quantity >= 0);

alter table low_stock_thresholds
  add constraint low_stock_thresholds_min_quantity_positive check (min_quantity > 0);

-- Foundational master-data numbers: every kg figure in the app is derived
-- from pipe weight, so a zero/negative weight would corrupt stock math
-- everywhere it's used.
alter table pipe_products
  add constraint pipe_products_diameter_positive check (diameter_inches > 0),
  add constraint pipe_products_weight_positive check (weight_kg > 0);

alter table raw_material_types
  add constraint raw_material_types_default_pack_positive
    check (default_pack_kg is null or default_pack_kg > 0);

-- =========================================================================
-- Atomic batch save RPCs
-- =========================================================================

create or replace function add_production_quantities_batch(p_rows jsonb)
returns setof production_entries language plpgsql as $$
declare
  r jsonb;
  v_row production_entries;
begin
  for r in select * from jsonb_array_elements(p_rows)
  loop
    insert into production_entries (entry_date, pipe_product_id, quantity, notes)
    values (
      (r->>'entry_date')::date,
      (r->>'pipe_product_id')::uuid,
      (r->>'quantity')::numeric,
      r->>'notes'
    )
    on conflict (entry_date, pipe_product_id)
    do update set
      quantity = production_entries.quantity + excluded.quantity,
      notes = coalesce(excluded.notes, production_entries.notes),
      updated_at = now()
    returning * into v_row;
    return next v_row;
  end loop;
  return;
end;
$$;

grant execute on function add_production_quantities_batch(jsonb) to anon, authenticated;

create or replace function add_sales_quantities_batch(p_rows jsonb)
returns setof sales_entries language plpgsql as $$
declare
  r jsonb;
  v_row sales_entries;
begin
  for r in select * from jsonb_array_elements(p_rows)
  loop
    insert into sales_entries (entry_date, pipe_product_id, customer_id, quantity, notes)
    values (
      (r->>'entry_date')::date,
      (r->>'pipe_product_id')::uuid,
      (r->>'customer_id')::uuid,
      (r->>'quantity')::numeric,
      r->>'notes'
    )
    on conflict (entry_date, pipe_product_id, customer_id)
    do update set
      quantity = sales_entries.quantity + excluded.quantity,
      notes = coalesce(excluded.notes, sales_entries.notes),
      updated_at = now()
    returning * into v_row;
    return next v_row;
  end loop;
  return;
end;
$$;

grant execute on function add_sales_quantities_batch(jsonb) to anon, authenticated;
