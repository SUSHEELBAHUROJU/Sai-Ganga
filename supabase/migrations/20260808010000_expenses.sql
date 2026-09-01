-- Independent Expenses module: a user-extensible category list plus
-- transaction-level expense records (never one aggregated blob per month —
-- same "store the transaction, derive everything else" principle as every
-- other entry table, so category-wise/date-range reporting is just a filter).

-- =========================================================================
-- 1. expense_categories — seeded with the three standard categories, but not
--    hard-coded to only ever be those three: is_active follows the same
--    remove/restore convention as scrap_types/raw_material_types, and any
--    number of custom categories can be added from Settings.
-- =========================================================================
create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Robustly identifies "the Salaries category" for report bucketing without
  -- matching on the seeded name, which the user can rename — same reasoning
  -- as raw_material_types.is_recycled_output.
  is_salary boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

create unique index expense_categories_one_salary
  on expense_categories (is_salary)
  where is_salary;

create trigger set_expense_categories_updated_at before update on expense_categories
  for each row execute function set_updated_at();

alter table expense_categories enable row level security;
create policy "must be signed in" on expense_categories
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

revoke all on expense_categories from public, anon;
grant select, insert, update, delete on expense_categories to authenticated;

insert into expense_categories (name, is_salary) values
  ('Salaries', true),
  ('Electricity Bill', false),
  ('Miscellaneous', false);

-- =========================================================================
-- 2. expenses — one row per expense transaction.
-- =========================================================================
create table expenses (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  category_id uuid not null references expense_categories(id),
  amount numeric(10,2) not null check (amount > 0),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_expenses_date on expenses (entry_date);
create index idx_expenses_category on expenses (category_id);

create trigger set_expenses_updated_at before update on expenses
  for each row execute function set_updated_at();

alter table expenses enable row level security;
create policy "must be signed in" on expenses
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

revoke all on expenses from public, anon;
grant select, insert, update, delete on expenses to authenticated;
