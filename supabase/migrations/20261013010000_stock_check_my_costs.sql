-- "My Costs": the owner's own cost per kg for a stock-check week.
--
-- Beside the material prices (stock_check_manual_rates), the owner enters
-- what making the pipe costs them in their own terms:
--   * operator pay per kg — pipe made (₹2.50/kg) and granules recycled (₹2.60/kg)
--   * electricity per kg — pipe made and granules recycled
--   * any other costs for the week by name — day wages, machinery, repairs
-- Cost per kg = (material + operator + electricity + other) ÷ pipe made.
-- Expenses recorded in the app can be added too, but are left out by default
-- so salaries and electricity entered here aren't counted twice.
--
-- One row per count that closes the week; deleting the count removes it.

create table stock_check_my_costs (
  count_id uuid primary key references stock_counts(id) on delete cascade,
  operator_pipe_rate numeric(10,2) not null default 0 check (operator_pipe_rate >= 0),
  operator_recycled_rate numeric(10,2) not null default 0 check (operator_recycled_rate >= 0),
  electricity_pipe_rate numeric(10,2) not null default 0 check (electricity_pipe_rate >= 0),
  electricity_recycled_rate numeric(10,2) not null default 0 check (electricity_recycled_rate >= 0),
  -- [{ "name": "Day wages", "amount": 12000 }, …]
  extra_costs jsonb not null default '[]' check (jsonb_typeof(extra_costs) = 'array'),
  include_app_expenses boolean not null default false,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on stock_check_my_costs
  for each row execute function set_updated_at();

alter table stock_check_my_costs enable row level security;

create policy "must be signed in" on stock_check_my_costs
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

revoke all on stock_check_my_costs from public, anon;
grant select, insert, update, delete on stock_check_my_costs to authenticated;

-- Weeks priced before this keep their figure: material at their prices plus
-- the app's running costs, nothing else.
insert into stock_check_my_costs (count_id, include_app_expenses)
select distinct count_id, true from stock_check_manual_rates;

-- Save a week's material prices and costs in one step; materials left out go
-- back to the app's rate.
create or replace function save_stock_check_my_costs(p_count_id uuid, p_rates jsonb, p_costs jsonb)
returns void
language plpgsql as $$
begin
  delete from stock_check_manual_rates where count_id = p_count_id;

  insert into stock_check_manual_rates (count_id, raw_material_type_id, rate_per_kg)
  select p_count_id, (r->>'raw_material_type_id')::uuid, (r->>'rate_per_kg')::numeric
  from jsonb_array_elements(p_rates) r;

  insert into stock_check_my_costs (
    count_id, operator_pipe_rate, operator_recycled_rate,
    electricity_pipe_rate, electricity_recycled_rate, extra_costs, include_app_expenses
  ) values (
    p_count_id,
    coalesce((p_costs->>'operator_pipe_rate')::numeric, 0),
    coalesce((p_costs->>'operator_recycled_rate')::numeric, 0),
    coalesce((p_costs->>'electricity_pipe_rate')::numeric, 0),
    coalesce((p_costs->>'electricity_recycled_rate')::numeric, 0),
    coalesce(p_costs->'extra_costs', '[]'),
    coalesce((p_costs->>'include_app_expenses')::boolean, false)
  )
  on conflict (count_id) do update set
    operator_pipe_rate = excluded.operator_pipe_rate,
    operator_recycled_rate = excluded.operator_recycled_rate,
    electricity_pipe_rate = excluded.electricity_pipe_rate,
    electricity_recycled_rate = excluded.electricity_recycled_rate,
    extra_costs = excluded.extra_costs,
    include_app_expenses = excluded.include_app_expenses;
end;
$$;

revoke execute on function save_stock_check_my_costs(uuid, jsonb, jsonb) from public;
grant execute on function save_stock_check_my_costs(uuid, jsonb, jsonb) to authenticated;
