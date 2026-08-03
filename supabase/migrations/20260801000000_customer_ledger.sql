-- Customer payment ledger (khata): every bill creates a "due" against its
-- customer, every payment reduces it. Balance and bill payment status are
-- always computed live (views/RPCs), never stored as a mutable field — same
-- principle as finished_goods_stock / raw_material_stock / scrap_stock, so
-- editing or voiding a bill, or deleting a payment, can never drift out of
-- sync with the numbers shown on screen.

-- =========================================================================
-- 1. Table
-- =========================================================================

create table ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  type text not null check (type in ('due', 'received')),
  amount numeric(12,2) not null check (amount > 0),
  date date not null default current_date,
  payment_mode text check (payment_mode in ('cash', 'online')),
  payment_app text check (payment_app in ('phonepe', 'gpay', 'other')),
  bill_id uuid references bills(id) on delete set null,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on ledger_transactions
  for each row execute function set_updated_at();

create index idx_ledger_transactions_customer on ledger_transactions (customer_id);
create index idx_ledger_transactions_date on ledger_transactions (date);
create index idx_ledger_transactions_bill on ledger_transactions (bill_id);
create index idx_ledger_transactions_customer_date on ledger_transactions (customer_id, date);

-- This table is created after 20260731000000_require_authentication.sql, so
-- it isn't swept up by that migration's dynamic policy loop — lock it down
-- explicitly here, same posture (authenticated only, no anon access).
alter table ledger_transactions enable row level security;
create policy "must be signed in" on ledger_transactions
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

revoke all on ledger_transactions from public, anon;
grant select, insert, update, delete on ledger_transactions to authenticated;

-- =========================================================================
-- 2. Bill <-> ledger sync triggers
-- =========================================================================

create or replace function create_ledger_due_on_bill()
returns trigger
language plpgsql
as $$
begin
  if new.customer_id is not null then
    insert into ledger_transactions (customer_id, type, amount, date, bill_id, note)
    values (new.customer_id, 'due', new.grand_total, new.bill_date, new.id, 'Bill ' || new.bill_number);
  end if;
  return new;
end;
$$;

create trigger bills_create_ledger_due
  after insert on bills
  for each row execute function create_ledger_due_on_bill();

-- Keeps the due entry attributed to the right customer if a bill is
-- reassigned, and its date in sync if that changes. Voiding a bill needs no
-- action here — customer_ledger_balance / bill_payment_status both filter
-- to status = 'active', so a voided bill's due drops out on its own.
create or replace function sync_ledger_due_on_bill_update()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'voided' then
    return new;
  end if;

  if new.customer_id is distinct from old.customer_id then
    delete from ledger_transactions where bill_id = new.id and type = 'due';
    if new.customer_id is not null then
      insert into ledger_transactions (customer_id, type, amount, date, bill_id, note)
      values (new.customer_id, 'due', new.grand_total, new.bill_date, new.id, 'Bill ' || new.bill_number);
    end if;
  else
    update ledger_transactions
    set date = new.bill_date
    where bill_id = new.id and type = 'due';
  end if;

  return new;
end;
$$;

create trigger bills_sync_ledger_due
  after update on bills
  for each row execute function sync_ledger_due_on_bill_update();

-- =========================================================================
-- 3. Views — balance and bill payment status, always computed live
-- =========================================================================

create view customer_ledger_balance
  with (security_invoker = true) as
select
  c.id as customer_id,
  c.name,
  c.phone,
  coalesce(bill_due.total, 0) + coalesce(manual_due.total, 0) as total_due,
  coalesce(recv.total, 0) as total_received,
  coalesce(bill_due.total, 0) + coalesce(manual_due.total, 0) - coalesce(recv.total, 0) as balance
from customers c
left join (
  select customer_id, sum(grand_total) as total
  from bills
  where status = 'active' and customer_id is not null
  group by customer_id
) bill_due on bill_due.customer_id = c.id
left join (
  select customer_id, sum(amount) as total
  from ledger_transactions
  where type = 'due' and bill_id is null
  group by customer_id
) manual_due on manual_due.customer_id = c.id
left join (
  select customer_id, sum(amount) as total
  from ledger_transactions
  where type = 'received'
  group by customer_id
) recv on recv.customer_id = c.id;

grant select on customer_ledger_balance to authenticated;

-- FIFO waterfall: allocate each customer's cumulative payments against their
-- bills ordered oldest-first. cumulative_total - grand_total = everything
-- billed before this bill; total_received minus that = how much of the
-- payment pool is left by the time we reach this bill, clamped to this
-- bill's own total. Naturally handles overpayment (nothing left to owe on
-- later bills) and voided bills (excluded from the window entirely, so a
-- payment that had been covering one frees up for the next).
create view bill_payment_status
  with (security_invoker = true) as
with customer_payments as (
  select customer_id, coalesce(sum(amount), 0) as total_received
  from ledger_transactions
  where type = 'received'
  group by customer_id
),
ordered_bills as (
  select
    b.id as bill_id,
    b.customer_id,
    b.grand_total,
    sum(b.grand_total) over (
      partition by b.customer_id order by b.bill_date, b.created_at
      rows between unbounded preceding and current row
    ) as cumulative_total
  from bills b
  where b.customer_id is not null and b.status = 'active'
)
select
  ob.bill_id,
  ob.customer_id,
  ob.grand_total,
  greatest(0, least(ob.grand_total, coalesce(cp.total_received, 0) - (ob.cumulative_total - ob.grand_total))) as paid_amount,
  ob.grand_total - greatest(0, least(ob.grand_total, coalesce(cp.total_received, 0) - (ob.cumulative_total - ob.grand_total))) as due_amount,
  case
    when greatest(0, least(ob.grand_total, coalesce(cp.total_received, 0) - (ob.cumulative_total - ob.grand_total))) >= ob.grand_total then 'paid'
    when greatest(0, least(ob.grand_total, coalesce(cp.total_received, 0) - (ob.cumulative_total - ob.grand_total))) > 0 then 'partial'
    else 'due'
  end as payment_status
from ordered_bills ob
left join customer_payments cp on cp.customer_id = ob.customer_id;

grant select on bill_payment_status to authenticated;

-- =========================================================================
-- 4. RPCs
-- =========================================================================

create or replace function rpc_customer_passbook(p_customer_id uuid)
returns table (
  id uuid,
  entry_date date,
  type text,
  amount numeric,
  running_balance numeric,
  payment_mode text,
  payment_app text,
  bill_number text,
  note text,
  created_at timestamptz
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
      b.bill_number,
      lt.note,
      lt.created_at
    from ledger_transactions lt
    left join bills b on b.id = lt.bill_id
    where lt.customer_id = p_customer_id
      and (lt.bill_id is null or b.status = 'active')
  )
  select
    id, entry_date, type, amount,
    sum(case when type = 'due' then amount else -amount end)
      over (order by entry_date, created_at rows between unbounded preceding and current row) as running_balance,
    payment_mode, payment_app, bill_number, note, created_at
  from txns
  order by entry_date desc, created_at desc;
$$;

create or replace function rpc_collections_by_mode(p_from date, p_to date)
returns table (cash_total numeric, online_total numeric, combined_total numeric)
language sql stable as $$
  select
    coalesce(sum(amount) filter (where payment_mode = 'cash'), 0) as cash_total,
    coalesce(sum(amount) filter (where payment_mode = 'online'), 0) as online_total,
    coalesce(sum(amount), 0) as combined_total
  from ledger_transactions
  where type = 'received' and date between p_from and p_to;
$$;

revoke execute on function rpc_customer_passbook(uuid) from public;
revoke execute on function rpc_collections_by_mode(date, date) from public;

grant execute on function rpc_customer_passbook(uuid) to authenticated;
grant execute on function rpc_collections_by_mode(date, date) to authenticated;
