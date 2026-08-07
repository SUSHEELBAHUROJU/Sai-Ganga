-- Transportation charges on a bill, plus the ledger-sync fix that adding a
-- late charge to an existing bill exposed.

-- =========================================================================
-- 1. transport_charges column
-- =========================================================================
-- Delivery/freight billed on top of the goods. Kept as its own column rather
-- than folded into `tax` so it stays separately reportable and prints as its
-- own line on the invoice.
alter table bills
  add column if not exists transport_charges numeric(12,2) not null default 0;

-- =========================================================================
-- 2. Keep the customer's ledger due in step with the bill total
-- =========================================================================
-- The original trigger only re-synced `date` when a bill was edited without
-- changing customer, so any edit that moved grand_total (a corrected rate, a
-- changed quantity, and now a transport charge) left the customer owing the
-- pre-edit amount forever. Sync the amount too.
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
    set date = new.bill_date,
        amount = new.grand_total
    where bill_id = new.id and type = 'due';
  end if;

  return new;
end;
$$;

-- Repair balances that already drifted from the bug above: any existing due
-- whose amount no longer matches its (active) bill's grand_total.
update ledger_transactions lt
set amount = b.grand_total
from bills b
where lt.bill_id = b.id
  and lt.type = 'due'
  and b.status = 'active'
  and lt.amount is distinct from b.grand_total;
