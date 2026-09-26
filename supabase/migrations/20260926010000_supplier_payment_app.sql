-- Online supplier payments record which app the money went through
-- (PhonePe / GPay / Paytm / Other), same idea as ledger_transactions.payment_app
-- on the customer side. Only meaningful for payment_mode = 'online'.

alter table supplier_ledger_transactions
  add column payment_app text check (payment_app in ('phonepe', 'gpay', 'paytm', 'other'));

alter table supplier_ledger_transactions
  add constraint supplier_ledger_app_only_online check (payment_app is null or payment_mode = 'online');

-- The passbook returns the new column, and a function's return type can't be
-- changed with create or replace — drop and recreate it.
drop function rpc_supplier_passbook(text, uuid);

create or replace function rpc_supplier_passbook(p_party_type text, p_party_id uuid)
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
  created_at timestamptz
)
language sql stable as $$
  with events as (
    select
      rp.id, 'purchase'::text as kind, rp.entry_date, rp.cost as amount,
      rt.name as item_name, rp.total_qty_kg as quantity_kg, rp.price_per_kg,
      null::text as payment_mode, null::text as payment_app, null::text as paid_to, null::text as reference_no,
      null::text as bank_account, null::text as paid_by, rp.notes as note, rp.created_at
    from raw_material_purchases rp
    left join raw_material_types rt on rt.id = rp.raw_material_type_id
    where p_party_type = 'supplier' and rp.supplier_id = p_party_id and rp.cost is not null

    union all

    select
      sp.id, 'purchase', sp.entry_date, sp.cost,
      st.name, sp.quantity_kg, sp.price_per_kg,
      null, null, null, null, null, null, sp.notes, sp.created_at
    from scrap_purchases sp
    left join scrap_types st on st.id = sp.scrap_type_id
    where p_party_type = 'scrap_dealer' and sp.scrap_dealer_id = p_party_id and sp.cost is not null

    union all

    select
      t.id, t.type, t.date, t.amount,
      null, null, null,
      t.payment_mode, t.payment_app, t.paid_to, t.reference_no, t.bank_account, t.paid_by, t.note, t.created_at
    from supplier_ledger_transactions t
    where t.party_type = p_party_type
      and coalesce(t.supplier_id, t.scrap_dealer_id) = p_party_id
  )
  select
    id, kind, entry_date, amount,
    sum(case when kind = 'payment' then -amount else amount end)
      over (order by entry_date, created_at, id rows between unbounded preceding and current row) as running_balance,
    item_name, quantity_kg, price_per_kg,
    payment_mode, payment_app, paid_to, reference_no, bank_account, paid_by, note, created_at
  from events
  order by entry_date desc, created_at desc, id desc;
$$;

revoke execute on function rpc_supplier_passbook(text, uuid) from public;
grant execute on function rpc_supplier_passbook(text, uuid) to authenticated;
