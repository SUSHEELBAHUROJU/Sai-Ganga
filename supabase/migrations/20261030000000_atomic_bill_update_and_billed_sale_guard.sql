-- Two ways a bill and its sale entries could drift apart:
--
--   1. Editing a bill was three separate requests from the browser: update the
--      bill, delete its sale entries, re-insert them — and the last two never
--      checked for errors. A dropped connection in between left a bill with no
--      sales, so its pipes silently went back into stock.
--
--   2. Records offered Edit / Delete on each line of a billed sale. Changing
--      one moved stock, but the bill's line items, total and the customer's
--      due stayed as they were — the customer was still charged for pipes the
--      stock said were never sold.
--
-- (1) closes with update_bill_with_sales: the bill and its sale entries are
-- rewritten in one transaction, so either both change or neither does.
-- (2) closes with a guard trigger: a sale entry that belongs to a bill can
-- only be changed through its bill. The app now sends those edits to the bill
-- editor; the trigger is the backstop for any other client.

-- =========================================================================
-- 1. Bill + sale entries updated in one transaction
-- =========================================================================
create or replace function update_bill_with_sales(p_bill jsonb)
returns bills
language plpgsql as $$
declare
  v_id uuid := (p_bill->>'id')::uuid;
  v_bill bills;
  v_line jsonb;
begin
  select * into v_bill from bills where id = v_id for update;
  if not found then
    raise exception 'Bill not found' using errcode = 'P0002';
  end if;
  if v_bill.status <> 'active' then
    raise exception 'Bill % is voided and can no longer be edited', v_bill.bill_number
      using errcode = 'P0001';
  end if;

  update bills set
    -- Only renamed when the caller sends a number: an untouched bill never
    -- rewrites its own number.
    bill_number = coalesce(nullif(btrim(p_bill->>'bill_number'), ''), bill_number),
    bill_date = (p_bill->>'bill_date')::date,
    customer_id = nullif(p_bill->>'customer_id', '')::uuid,
    customer_name = p_bill->>'customer_name',
    customer_address = nullif(p_bill->>'customer_address', ''),
    customer_phone = nullif(p_bill->>'customer_phone', ''),
    line_items = p_bill->'line_items',
    subtotal = coalesce((p_bill->>'subtotal')::numeric, 0),
    discount = coalesce((p_bill->>'discount')::numeric, 0),
    tax = coalesce((p_bill->>'tax')::numeric, 0),
    transport_charges = coalesce((p_bill->>'transport_charges')::numeric, 0),
    grand_total = coalesce((p_bill->>'grand_total')::numeric, 0),
    notes = nullif(p_bill->>'notes', ''),
    updated_at = now()
  where id = v_id
  returning * into v_bill;

  -- Lets the guard below know this rewrite is the bill's own.
  perform set_config('sai_ganga.bill_sync', 'on', true);

  delete from sales_entries where bill_id = v_id;

  for v_line in select * from jsonb_array_elements(v_bill.line_items)
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

  perform set_config('sai_ganga.bill_sync', 'off', true);

  return v_bill;
end;
$$;

revoke execute on function update_bill_with_sales(jsonb) from public;
grant execute on function update_bill_with_sales(jsonb) to authenticated;

-- =========================================================================
-- 2. A billed sale entry can only change through its bill
-- =========================================================================
create or replace function guard_billed_sales_entry()
returns trigger
language plpgsql as $$
begin
  -- Allowed: the bill's own rewrite (update_bill_with_sales), and anything
  -- fired from another trigger — e.g. ON DELETE SET NULL when a bill row is
  -- removed.
  if current_setting('sai_ganga.bill_sync', true) = 'on' or pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if old.bill_id is not null then
    raise exception 'This sale is on a bill. Edit the bill to change or remove it.'
      using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists sales_entries_guard_billed on sales_entries;
create trigger sales_entries_guard_billed
  before update or delete on sales_entries
  for each row execute function guard_billed_sales_entry();
