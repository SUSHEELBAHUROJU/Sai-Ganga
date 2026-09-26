-- Move a batch of production / recycling entries to another date in one step
-- — for when a day's output was logged under the wrong date (entered on the
-- 23rd, actually produced on the 22nd). Records' per-item edit could already
-- change one entry's date; this does a whole session atomically.
--
-- production_entries is one row per (entry_date, pipe_product_id). If the
-- target date already has a row for the same pipe, the moved quantity is
-- merged into it — the same rule add_production_quantities_batch applies when
-- production is added — and the moved row is removed. Otherwise the row just
-- gets the new date and keeps its id.
--
-- recycling_entries has no per-date uniqueness, so those rows are re-dated.
--
-- Stock is derived from totals, not dates, so no stock figure changes; only
-- the day-by-day reports move with the entries.

create or replace function move_entries_date(
  p_production_ids uuid[],
  p_recycling_ids uuid[],
  p_new_date date
)
returns table (moved integer, merged integer)
language plpgsql as $$
declare
  rec production_entries;
  v_moved integer := 0;
  v_merged integer := 0;
  v_count integer;
begin
  if p_new_date is null then
    raise exception 'A date is required';
  end if;

  for rec in
    select * from production_entries
    where id = any(coalesce(p_production_ids, '{}'))
      and entry_date <> p_new_date
    for update
  loop
    update production_entries
    set quantity = quantity + rec.quantity,
        notes = coalesce(notes, rec.notes),
        updated_at = now()
    where entry_date = p_new_date and pipe_product_id = rec.pipe_product_id;

    if found then
      delete from production_entries where id = rec.id;
      v_merged := v_merged + 1;
    else
      update production_entries set entry_date = p_new_date where id = rec.id;
    end if;
    v_moved := v_moved + 1;
  end loop;

  update recycling_entries
  set entry_date = p_new_date
  where id = any(coalesce(p_recycling_ids, '{}'))
    and entry_date <> p_new_date;
  get diagnostics v_count = row_count;
  v_moved := v_moved + v_count;

  return query select v_moved, v_merged;
end;
$$;

revoke execute on function move_entries_date(uuid[], uuid[], date) from public;
grant execute on function move_entries_date(uuid[], uuid[], date) to authenticated;
