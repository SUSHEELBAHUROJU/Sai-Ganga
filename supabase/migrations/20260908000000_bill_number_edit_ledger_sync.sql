-- Bill numbers became editable (behind a lock toggle in EditBillModal), which
-- exposed a drift in the ledger: a bill's due note is baked as
-- 'Bill ' || bill_number when the due is first created, and this trigger only
-- rewrote it when the customer changed. The passbook renders the live joined
-- bill_number *and* the note, so a renamed bill read "Bill SG-0040" with
-- "Bill SG-0035" in italics underneath it.
--
-- Only the note is new here; the rest is carried over unchanged from
-- 20260801000000_customer_ledger.sql.

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
        -- Rewritten only on an actual rename, so nothing else that may have
        -- been put in the note gets clobbered by an unrelated bill edit.
        note = case
                 when new.bill_number is distinct from old.bill_number
                   then 'Bill ' || new.bill_number
                 else note
               end
    where bill_id = new.id and type = 'due';
  end if;

  return new;
end;
$$;
