-- Supplier ledger (khata) for raw-material suppliers and scrap dealers: what
-- the factory owes each supplier, what it has paid them, and any advance
-- sitting with them.
--
-- Same principle as the customer ledger (20260801000000), taken one step
-- further: purchases are NOT copied into the ledger table at all. The balance
-- view and passbook RPC read raw_material_purchases.cost / scrap_purchases.cost
-- directly, so editing a purchase's quantity (short delivery), re-assigning
-- its supplier, or deleting it from Records moves the ledger with it — no
-- trigger to keep in sync, nothing to drift. The table below only holds money
-- movements and manual adjustments.
--
-- Only the material cost counts: transport_charges are paid to the
-- transporter, not the supplier. Purchases with no linked supplier/dealer
-- (walk-in sellers, legacy free-text supplier_name) or no recorded cost
-- (rows from before cost was required) are outside the ledger.

-- =========================================================================
-- 1. Table
-- =========================================================================

create table supplier_ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  party_type text not null check (party_type in ('supplier', 'scrap_dealer')),
  supplier_id uuid references raw_material_suppliers(id) on delete cascade,
  scrap_dealer_id uuid references scrap_dealers(id) on delete cascade,
  -- payment: we paid them. due: a payable not tied to a purchase (e.g. an
  -- opening balance carried over from paper). refund: they returned money,
  -- e.g. leftover advance after a short delivery.
  type text not null check (type in ('payment', 'due', 'refund')),
  amount numeric(12,2) not null check (amount > 0),
  date date not null default current_date,
  payment_mode text check (payment_mode in ('cash', 'online', 'cash_deposit')),
  -- Who actually received the money — often a friend or relative of the
  -- supplier rather than the supplier themself.
  paid_to text,
  reference_no text,
  bank_account text,
  -- Who handed over the cash / made the transfer on the factory's side.
  paid_by text,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_ledger_party_matches check (
    (party_type = 'supplier' and supplier_id is not null and scrap_dealer_id is null)
    or (party_type = 'scrap_dealer' and scrap_dealer_id is not null and supplier_id is null)
  ),
  constraint supplier_ledger_payment_has_mode check (type <> 'payment' or payment_mode is not null)
);

create trigger set_updated_at before update on supplier_ledger_transactions
  for each row execute function set_updated_at();

create index idx_supplier_ledger_supplier_date on supplier_ledger_transactions (supplier_id, date);
create index idx_supplier_ledger_dealer_date on supplier_ledger_transactions (scrap_dealer_id, date);
create index idx_supplier_ledger_date on supplier_ledger_transactions (date);

-- Created after 20260731000000_require_authentication.sql, so lock it down
-- explicitly — same posture as ledger_transactions.
alter table supplier_ledger_transactions enable row level security;
create policy "must be signed in" on supplier_ledger_transactions
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

revoke all on supplier_ledger_transactions from public, anon;
grant select, insert, update, delete on supplier_ledger_transactions to authenticated;

-- =========================================================================
-- 2. Balance view — one row per supplier and per scrap dealer
--    balance > 0: the factory owes them (payable)
--    balance < 0: advance sitting with them
-- =========================================================================

create view supplier_ledger_balance
  with (security_invoker = true) as
with txn_totals as (
  select
    party_type,
    coalesce(supplier_id, scrap_dealer_id) as party_id,
    coalesce(sum(amount) filter (where type = 'due'), 0) as manual_due,
    coalesce(sum(amount) filter (where type = 'payment'), 0) as paid,
    coalesce(sum(amount) filter (where type = 'refund'), 0) as refunded
  from supplier_ledger_transactions
  group by party_type, coalesce(supplier_id, scrap_dealer_id)
),
parties as (
  select
    'supplier'::text as party_type,
    s.id as party_id,
    s.name,
    s.phone,
    s.is_active,
    coalesce(p.total, 0) as purchased
  from raw_material_suppliers s
  left join (
    select supplier_id, sum(cost) as total
    from raw_material_purchases
    where supplier_id is not null and cost is not null
    group by supplier_id
  ) p on p.supplier_id = s.id
  union all
  select
    'scrap_dealer'::text,
    d.id,
    d.name,
    d.phone,
    d.is_active,
    coalesce(p.total, 0)
  from scrap_dealers d
  left join (
    select scrap_dealer_id, sum(cost) as total
    from scrap_purchases
    where scrap_dealer_id is not null and cost is not null
    group by scrap_dealer_id
  ) p on p.scrap_dealer_id = d.id
)
select
  pa.party_type,
  pa.party_id,
  pa.name,
  pa.phone,
  pa.is_active,
  pa.purchased + coalesce(t.manual_due, 0) as total_purchased,
  coalesce(t.paid, 0) - coalesce(t.refunded, 0) as total_paid,
  pa.purchased + coalesce(t.manual_due, 0) + coalesce(t.refunded, 0) - coalesce(t.paid, 0) as balance
from parties pa
left join txn_totals t on t.party_type = pa.party_type and t.party_id = pa.party_id;

grant select on supplier_ledger_balance to authenticated;

-- =========================================================================
-- 3. RPCs
-- =========================================================================

-- One party's passbook: purchases and ledger transactions interleaved by
-- date, newest first, with a running balance (purchase/due/refund add to
-- what's owed, payment subtracts).
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
      null::text as payment_mode, null::text as paid_to, null::text as reference_no,
      null::text as bank_account, null::text as paid_by, rp.notes as note, rp.created_at
    from raw_material_purchases rp
    left join raw_material_types rt on rt.id = rp.raw_material_type_id
    where p_party_type = 'supplier' and rp.supplier_id = p_party_id and rp.cost is not null

    union all

    select
      sp.id, 'purchase', sp.entry_date, sp.cost,
      st.name, sp.quantity_kg, sp.price_per_kg,
      null, null, null, null, null, sp.notes, sp.created_at
    from scrap_purchases sp
    left join scrap_types st on st.id = sp.scrap_type_id
    where p_party_type = 'scrap_dealer' and sp.scrap_dealer_id = p_party_id and sp.cost is not null

    union all

    select
      t.id, t.type, t.date, t.amount,
      null, null, null,
      t.payment_mode, t.paid_to, t.reference_no, t.bank_account, t.paid_by, t.note, t.created_at
    from supplier_ledger_transactions t
    where t.party_type = p_party_type
      and coalesce(t.supplier_id, t.scrap_dealer_id) = p_party_id
  )
  select
    id, kind, entry_date, amount,
    sum(case when kind = 'payment' then -amount else amount end)
      over (order by entry_date, created_at, id rows between unbounded preceding and current row) as running_balance,
    item_name, quantity_kg, price_per_kg,
    payment_mode, paid_to, reference_no, bank_account, paid_by, note, created_at
  from events
  order by entry_date desc, created_at desc, id desc;
$$;

create or replace function rpc_supplier_payments_by_mode(p_from date, p_to date)
returns table (cash_total numeric, online_total numeric, cash_deposit_total numeric, combined_total numeric)
language sql stable as $$
  select
    coalesce(sum(amount) filter (where payment_mode = 'cash'), 0),
    coalesce(sum(amount) filter (where payment_mode = 'online'), 0),
    coalesce(sum(amount) filter (where payment_mode = 'cash_deposit'), 0),
    coalesce(sum(amount), 0)
  from supplier_ledger_transactions
  where type = 'payment' and date between p_from and p_to;
$$;

revoke execute on function rpc_supplier_passbook(text, uuid) from public;
revoke execute on function rpc_supplier_payments_by_mode(date, date) from public;

grant execute on function rpc_supplier_passbook(text, uuid) to authenticated;
grant execute on function rpc_supplier_payments_by_mode(date, date) to authenticated;
