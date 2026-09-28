-- Prices the user types in for a stock-check week, per material used.
--
-- The weekly report works material cost out itself (FIFO over purchase lots).
-- When the owner wants to check it against their own rates, they enter a
-- price per kg for the materials used and the report shows the cost with
-- those prices beside the app's figure. The app's calculation is unchanged;
-- these rates are only used for that side-by-side.
--
-- Keyed by the count that closes the week. save_stock_count upserts on the
-- count date, so editing a count keeps its id and its prices; deleting the
-- count removes them.

create table stock_check_manual_rates (
  count_id uuid not null references stock_counts(id) on delete cascade,
  raw_material_type_id uuid not null references raw_material_types(id),
  rate_per_kg numeric(10,2) not null check (rate_per_kg >= 0),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (count_id, raw_material_type_id)
);

create trigger set_updated_at before update on stock_check_manual_rates
  for each row execute function set_updated_at();

alter table stock_check_manual_rates enable row level security;

create policy "must be signed in" on stock_check_manual_rates
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

revoke all on stock_check_manual_rates from public, anon;
grant select, insert, update, delete on stock_check_manual_rates to authenticated;

-- Replace a week's prices in one step; materials left out go back to the
-- app's rate.
create or replace function save_stock_check_manual_rates(p_count_id uuid, p_rates jsonb)
returns void
language plpgsql as $$
begin
  delete from stock_check_manual_rates where count_id = p_count_id;

  insert into stock_check_manual_rates (count_id, raw_material_type_id, rate_per_kg)
  select p_count_id, (r->>'raw_material_type_id')::uuid, (r->>'rate_per_kg')::numeric
  from jsonb_array_elements(p_rates) r;
end;
$$;

revoke execute on function save_stock_check_manual_rates(uuid, jsonb) from public;
grant execute on function save_stock_check_manual_rates(uuid, jsonb) to authenticated;
