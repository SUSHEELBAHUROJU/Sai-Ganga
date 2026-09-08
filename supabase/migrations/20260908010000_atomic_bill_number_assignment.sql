-- Two defects in bill number assignment, both flowing from the same cause:
-- generate_next_bill_number() is a separate round trip from the insert that
-- consumes its result, so the two run in different transactions.
--
--   1. Burned numbers. The RPC's counter increment commits on its own. If the
--      insert then fails for ANY reason — a collision, a dropped connection, a
--      constraint — the number is already spent, and the invoice series is left
--      with a gap that nothing explains and nothing reclaims. Retrying burns
--      another one each time.
--
--   2. Collisions. The RPC returns prefix || counter without checking that the
--      number is free, so once a bill has been manually renamed onto a number
--      ahead of the counter, creation fails when the counter marches into it.
--
-- Both close by assigning the number in a BEFORE INSERT trigger. It runs inside
-- the insert's own transaction, so a failed insert rolls the counter back with
-- it, and it steps over numbers already taken.

-- =========================================================================
-- 1. The generator, now collision-aware
-- =========================================================================
create or replace function next_free_bill_number()
returns text
language plpgsql
as $$
declare
  v_prefix text;
  v_num integer;
  v_formatted text;
begin
  -- FOR UPDATE serialises concurrent inserts, and the lock is held until the
  -- transaction commits, so two bills can never be handed the same number.
  select bill_prefix, next_bill_number
  into v_prefix, v_num
  from company_settings
  where id = 'default'
  for update;

  if not found then
    v_prefix := 'SG-';
    v_num := 1;
    insert into company_settings (id, bill_prefix, next_bill_number)
    values ('default', 'SG-', 1);
  end if;

  -- Step over any number already held. Voided bills keep their number for
  -- audit, and they are matched here too, so a voided number is never reissued.
  loop
    v_formatted := v_prefix || lpad(v_num::text, 4, '0');
    exit when not exists (select 1 from bills where bill_number = v_formatted);
    v_num := v_num + 1;
  end loop;

  update company_settings
  set next_bill_number = v_num + 1,
      updated_at = now()
  where id = 'default';

  return v_formatted;
end;
$$;

grant execute on function next_free_bill_number() to anon, authenticated;

-- =========================================================================
-- 2. Assign it inside the insert's transaction
-- =========================================================================
create or replace function assign_bill_number()
returns trigger
language plpgsql
as $$
begin
  -- BEFORE ROW triggers run ahead of the NOT NULL check, so a client can omit
  -- bill_number entirely and let the series assign it. An explicitly supplied
  -- number is left alone — that is how a caller imports or backfills a bill.
  if new.bill_number is null or btrim(new.bill_number) = '' then
    new.bill_number := next_free_bill_number();
  end if;
  return new;
end;
$$;

drop trigger if exists bills_assign_bill_number on bills;
create trigger bills_assign_bill_number
  before insert on bills
  for each row execute function assign_bill_number();

-- =========================================================================
-- 3. Keep the old RPC working for clients still running the previous bundle
-- =========================================================================
-- Deprecated: calling this standalone still burns a number if the insert that
-- follows fails, which is the whole reason for the trigger above. It now at
-- least skips occupied numbers. New code should omit bill_number and let the
-- trigger fill it.
create or replace function generate_next_bill_number()
returns text
language plpgsql
as $$
begin
  return next_free_bill_number();
end;
$$;
