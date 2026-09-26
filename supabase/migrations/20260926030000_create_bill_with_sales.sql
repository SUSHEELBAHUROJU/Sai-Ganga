-- One-step sale billing: the Sale screen now takes the rate per line and a
-- single Save creates the bill and its sale entries together.
--
-- 1. A bill's sale rows belong to that bill. The old unique constraint (one
--    row per date + pipe + customer, across ALL sales) forced a second bill to
--    the same customer for the same size on the same day — a second load, or a
--    re-bill after voiding — to merge into the first bill's row and steal it
--    for the new bill. Uniqueness now applies only to rows not yet on a bill,
--    which is the "add to today's running total" case it was written for.
--
-- 2. create_bill_with_sales inserts the bill (its number is assigned by the
--    bills_assign_bill_number trigger) and its sale rows in one transaction:
--    before, the sale was saved first and the bill in a second step, so closing
--    the bill screen — or a failed bill insert — left a sale with no bill.

-- =========================================================================
-- 1. Uniqueness only among unbilled sales
-- =========================================================================
alter table sales_entries drop constraint sales_entries_date_product_customer_unique;

create unique index sales_entries_unbilled_date_product_customer_unique
  on sales_entries (entry_date, pipe_product_id, customer_id)
  where bill_id is null;

-- Same function as 20260730000000, with the conflict target naming the new
-- partial index (ON CONFLICT must repeat its predicate to infer it).
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
    on conflict (entry_date, pipe_product_id, customer_id) where bill_id is null
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

-- =========================================================================
-- 2. Bill + sale entries in one transaction
-- =========================================================================
create or replace function create_bill_with_sales(p_bill jsonb)
returns bills
language plpgsql as $$
declare
  v_bill bills;
  v_line jsonb;
begin
  insert into bills (
    bill_date, customer_id, customer_name, customer_address, customer_phone,
    line_items, subtotal, discount, tax, transport_charges, grand_total, notes, status
  )
  values (
    (p_bill->>'bill_date')::date,
    nullif(p_bill->>'customer_id', '')::uuid,
    p_bill->>'customer_name',
    nullif(p_bill->>'customer_address', ''),
    nullif(p_bill->>'customer_phone', ''),
    p_bill->'line_items',
    coalesce((p_bill->>'subtotal')::numeric, 0),
    coalesce((p_bill->>'discount')::numeric, 0),
    coalesce((p_bill->>'tax')::numeric, 0),
    coalesce((p_bill->>'transport_charges')::numeric, 0),
    coalesce((p_bill->>'grand_total')::numeric, 0),
    nullif(p_bill->>'notes', ''),
    'active'
  )
  returning * into v_bill;

  for v_line in select * from jsonb_array_elements(p_bill->'line_items')
  loop
    if v_line->>'pipe_product_id' is not null and coalesce((v_line->>'quantity_pcs')::numeric, 0) > 0 then
      insert into sales_entries (entry_date, pipe_product_id, customer_id, quantity, notes, bill_id)
      values (
        v_bill.bill_date,
        (v_line->>'pipe_product_id')::uuid,
        v_bill.customer_id,
        (v_line->>'quantity_pcs')::numeric,
        'Billed: ' || v_bill.customer_name,
        v_bill.id
      );
    end if;
  end loop;

  return v_bill;
end;
$$;

revoke execute on function create_bill_with_sales(jsonb) from public;
grant execute on function create_bill_with_sales(jsonb) to authenticated;
