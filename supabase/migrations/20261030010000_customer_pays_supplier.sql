-- Customer pays a supplier directly.
--
-- Sometimes a customer settles their bill by paying one of our suppliers (or
-- scrap dealers) instead of us. One movement of money then settles two
-- accounts: the customer owes us less, and we owe the supplier less.
--
-- It is recorded as the two entries the ledgers already understand — a
-- 'received' row in ledger_transactions and a 'payment' row in
-- supplier_ledger_transactions — linked so they always live and die together:
--
--   * record_customer_payment_to_supplier() writes both in one transaction.
--   * Deleting either side deletes the other (FK cascade one way, trigger the
--     other way).
--   * The supplier-side row can't be edited on its own: its amount, date and
--     mode belong to the customer payment, so a correction is delete + re-enter.
--
-- Balances need no change: customer_ledger_balance already counts every
-- 'received' row and supplier_ledger_balance every 'payment' row.

-- =========================================================================
-- 1. The link
-- =========================================================================
alter table supplier_ledger_transactions
  add column customer_ledger_txn_id uuid unique
    references ledger_transactions(id) on delete cascade;

-- A linked row is always a payment.
alter table supplier_ledger_transactions
  add constraint supplier_ledger_customer_link_is_payment
    check (customer_ledger_txn_id is null or type = 'payment');

-- =========================================================================
-- 2. Record both sides in one transaction
-- =========================================================================
create or replace function record_customer_payment_to_supplier(p jsonb)
returns ledger_transactions
language plpgsql as $$
declare
  v_party_type text := p->>'party_type';
  v_party_id uuid := (p->>'party_id')::uuid;
  v_amount numeric := (p->>'amount')::numeric;
  v_mode text := p->>'payment_mode';
  v_app text := case when p->>'payment_mode' = 'online' then nullif(p->>'payment_app', '') end;
  v_note text := nullif(btrim(p->>'note'), '');
  v_customer_txn ledger_transactions;
begin
  if v_party_type not in ('supplier', 'scrap_dealer') or v_party_id is null then
    raise exception 'Choose the supplier the customer paid' using errcode = 'P0001';
  end if;
  if v_mode not in ('cash', 'online') then
    raise exception 'Choose Cash or Online' using errcode = 'P0001';
  end if;

  insert into ledger_transactions (customer_id, type, amount, date, payment_mode, payment_app, note)
  values ((p->>'customer_id')::uuid, 'received', v_amount, (p->>'date')::date, v_mode, v_app, v_note)
  returning * into v_customer_txn;

  insert into supplier_ledger_transactions (
    party_type, supplier_id, scrap_dealer_id, type, amount, date,
    payment_mode, payment_app, note, customer_ledger_txn_id
  )
  values (
    v_party_type,
    case when v_party_type = 'supplier' then v_party_id end,
    case when v_party_type = 'scrap_dealer' then v_party_id end,
    'payment', v_amount, v_customer_txn.date,
    v_mode, v_app, v_note, v_customer_txn.id
  );

  return v_customer_txn;
end;
$$;

revoke execute on function record_customer_payment_to_supplier(jsonb) from public;
grant execute on function record_customer_payment_to_supplier(jsonb) to authenticated;

-- =========================================================================
-- 3. Keep the pair together
-- =========================================================================
create or replace function guard_customer_linked_supplier_payment()
returns trigger
language plpgsql as $$
begin
  -- Changes arriving through the FK cascade (the customer side was deleted)
  -- are the pair being removed together — let them through.
  if pg_trigger_depth() > 1 or old.customer_ledger_txn_id is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'This payment was made by a customer. Delete it and record it again from the customer''s ledger to change it.'
      using errcode = 'P0001';
  end if;

  -- AFTER DELETE: the supplier row is gone, take the customer row with it.
  delete from ledger_transactions where id = old.customer_ledger_txn_id;
  return old;
end;
$$;

drop trigger if exists supplier_ledger_linked_no_edit on supplier_ledger_transactions;
create trigger supplier_ledger_linked_no_edit
  before update on supplier_ledger_transactions
  for each row execute function guard_customer_linked_supplier_payment();

drop trigger if exists supplier_ledger_linked_delete_pair on supplier_ledger_transactions;
create trigger supplier_ledger_linked_delete_pair
  after delete on supplier_ledger_transactions
  for each row execute function guard_customer_linked_supplier_payment();

-- =========================================================================
-- 4. Customer passbook — says which supplier a payment went to
-- =========================================================================
drop function if exists rpc_customer_passbook(uuid);

create function rpc_customer_passbook(p_customer_id uuid)
returns table (
  id uuid,
  entry_date date,
  type text,
  amount numeric,
  running_balance numeric,
  payment_mode text,
  payment_app text,
  bill_id uuid,
  bill_number text,
  bill_total_kg numeric,
  note text,
  created_at timestamptz,
  paid_to_party_type text,
  paid_to_party_id uuid,
  paid_to_party_name text
)
language sql stable as $$
  with txns as (
    select
      lt.id,
      lt.date as entry_date,
      lt.type,
      case when lt.type = 'due' and lt.bill_id is not null
        then coalesce(b.grand_total, lt.amount)
        else lt.amount
      end as amount,
      lt.payment_mode,
      lt.payment_app,
      b.id as bill_id,
      b.bill_number,
      (
        select sum((li->>'weight_kg')::numeric)
        from jsonb_array_elements(b.line_items) li
      ) as bill_total_kg,
      lt.note,
      lt.created_at,
      st.party_type as paid_to_party_type,
      coalesce(st.supplier_id, st.scrap_dealer_id) as paid_to_party_id,
      coalesce(rs.name, sd.name) as paid_to_party_name
    from ledger_transactions lt
    left join bills b on b.id = lt.bill_id
    left join supplier_ledger_transactions st on st.customer_ledger_txn_id = lt.id
    left join raw_material_suppliers rs on rs.id = st.supplier_id
    left join scrap_dealers sd on sd.id = st.scrap_dealer_id
    where lt.customer_id = p_customer_id
      and (lt.bill_id is null or b.status = 'active')
  )
  select
    id, entry_date, type, amount,
    sum(case when type = 'due' then amount else -amount end)
      over (order by entry_date, created_at rows between unbounded preceding and current row) as running_balance,
    payment_mode, payment_app, bill_id, bill_number, bill_total_kg, note, created_at,
    paid_to_party_type, paid_to_party_id, paid_to_party_name
  from txns
  order by entry_date desc, created_at desc;
$$;

revoke execute on function rpc_customer_passbook(uuid) from public;
grant execute on function rpc_customer_passbook(uuid) to authenticated;

-- =========================================================================
-- 5. Supplier passbook — says which customer paid on our behalf
-- =========================================================================
drop function if exists rpc_supplier_passbook(text, uuid);

create function rpc_supplier_passbook(p_party_type text, p_party_id uuid)
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
  created_at timestamptz,
  paid_by_customer_id uuid,
  paid_by_customer_name text
)
language sql stable as $$
  with events as (
    select
      rp.id, 'purchase'::text as kind, rp.entry_date, rp.cost as amount,
      rt.name as item_name, rp.total_qty_kg as quantity_kg, rp.price_per_kg,
      null::text as payment_mode, null::text as payment_app, null::text as paid_to, null::text as reference_no,
      null::text as bank_account, null::text as paid_by, rp.notes as note, rp.created_at,
      null::uuid as paid_by_customer_id, null::text as paid_by_customer_name
    from raw_material_purchases rp
    left join raw_material_types rt on rt.id = rp.raw_material_type_id
    where p_party_type = 'supplier' and rp.supplier_id = p_party_id and rp.cost is not null

    union all

    select
      r.id, 'return', r.return_date,
      purchase_return_amount(r.quantity_kg, rp.price_per_kg, rp.cost, rp.total_qty_kg),
      rt.name, r.quantity_kg,
      coalesce(rp.price_per_kg, case when rp.total_qty_kg > 0 then round(rp.cost / rp.total_qty_kg, 2) end),
      null, null, null, null, null, null, r.reason, r.created_at,
      null, null
    from raw_material_purchase_returns r
    join raw_material_purchases rp on rp.id = r.purchase_id
    left join raw_material_types rt on rt.id = rp.raw_material_type_id
    where p_party_type = 'supplier' and rp.supplier_id = p_party_id and rp.cost is not null

    union all

    select
      sp.id, 'purchase', sp.entry_date, sp.cost,
      st.name, sp.quantity_kg, sp.price_per_kg,
      null, null, null, null, null, null, sp.notes, sp.created_at,
      null, null
    from scrap_purchases sp
    left join scrap_types st on st.id = sp.scrap_type_id
    where p_party_type = 'scrap_dealer' and sp.scrap_dealer_id = p_party_id and sp.cost is not null

    union all

    select
      t.id, t.type, t.date, t.amount,
      null, null, null,
      t.payment_mode, t.payment_app, t.paid_to, t.reference_no, t.bank_account, t.paid_by, t.note, t.created_at,
      c.id, c.name
    from supplier_ledger_transactions t
    left join ledger_transactions lt on lt.id = t.customer_ledger_txn_id
    left join customers c on c.id = lt.customer_id
    where t.party_type = p_party_type
      and coalesce(t.supplier_id, t.scrap_dealer_id) = p_party_id
  )
  select
    id, kind, entry_date, amount,
    sum(case when kind in ('payment', 'return') then -amount else amount end)
      over (order by entry_date, created_at, id rows between unbounded preceding and current row) as running_balance,
    item_name, quantity_kg, price_per_kg,
    payment_mode, payment_app, paid_to, reference_no, bank_account, paid_by, note, created_at,
    paid_by_customer_id, paid_by_customer_name
  from events
  order by entry_date desc, created_at desc, id desc;
$$;

revoke execute on function rpc_supplier_passbook(text, uuid) from public;
grant execute on function rpc_supplier_passbook(text, uuid) to authenticated;

-- =========================================================================
-- 6. Collections — money paid straight to a supplier never reached our cash
--    box or bank, so it gets its own figure instead of inflating Cash/Online.
-- =========================================================================
drop function if exists rpc_collections_by_mode(date, date);

create function rpc_collections_by_mode(p_from date, p_to date)
returns table (cash_total numeric, online_total numeric, combined_total numeric, to_supplier_total numeric)
language sql stable as $$
  select
    coalesce(sum(lt.amount) filter (where st.id is null and lt.payment_mode = 'cash'), 0),
    coalesce(sum(lt.amount) filter (where st.id is null and lt.payment_mode = 'online'), 0),
    coalesce(sum(lt.amount) filter (where st.id is null), 0),
    coalesce(sum(lt.amount) filter (where st.id is not null), 0)
  from ledger_transactions lt
  left join supplier_ledger_transactions st on st.customer_ledger_txn_id = lt.id
  where lt.type = 'received' and lt.date between p_from and p_to;
$$;

revoke execute on function rpc_collections_by_mode(date, date) from public;
grant execute on function rpc_collections_by_mode(date, date) to authenticated;

-- Same for what we paid out: a customer's payment to a supplier never left
-- our cash box either. (Return shape unchanged; the payment still counts in
-- the supplier's balance through supplier_ledger_balance.)
create or replace function rpc_supplier_payments_by_mode(p_from date, p_to date)
returns table (cash_total numeric, online_total numeric, cash_deposit_total numeric, combined_total numeric)
language sql stable as $$
  select
    coalesce(sum(amount) filter (where payment_mode = 'cash'), 0),
    coalesce(sum(amount) filter (where payment_mode = 'online'), 0),
    coalesce(sum(amount) filter (where payment_mode = 'cash_deposit'), 0),
    coalesce(sum(amount), 0)
  from supplier_ledger_transactions
  where type = 'payment' and customer_ledger_txn_id is null and date between p_from and p_to;
$$;
