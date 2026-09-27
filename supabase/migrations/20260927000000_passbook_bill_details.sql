-- Passbook rows for a bill now carry the bill's id and total weight, so the
-- customer passbook can open the full bill (same view as Records) and the
-- shared account statement can show each bill's total kg next to its amount.
--
-- The return type changes, so the function has to be dropped and recreated
-- rather than replaced.

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
      b.id as bill_id,
      b.bill_number,
      (
        select sum((li->>'weight_kg')::numeric)
        from jsonb_array_elements(b.line_items) li
      ) as bill_total_kg,
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
    payment_mode, payment_app, bill_id, bill_number, bill_total_kg, note, created_at
  from txns
  order by entry_date desc, created_at desc;
$$;

revoke execute on function rpc_customer_passbook(uuid) from public;
grant execute on function rpc_customer_passbook(uuid) to authenticated;
