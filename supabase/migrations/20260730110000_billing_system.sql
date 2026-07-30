-- Migration for Billing System & Company Settings

-- =========================================================================
-- 1. Company Settings table
-- =========================================================================
create table if not exists company_settings (
  id text primary key default 'default',
  business_name text not null default 'SAI GANGA POLYMER INDUSTRIES',
  address text not null default 'SY.NO.216, H.NO. 3-245, NH 65, opp. M.S.R. Institute, Durajpalle, Suryapet, Telangana 508213',
  gst_number text not null default '36ALRPB5625Q2ZG',
  phone text default '',
  bill_prefix text not null default 'SG-',
  next_bill_number integer not null default 1,
  bill_start_date date not null default current_date,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 'default')
);

alter table company_settings enable row level security;
create policy "allow all on company_settings" on company_settings for all using (true) with check (true);
grant select, insert, update, delete on company_settings to anon, authenticated;

-- Seed default company settings row if missing
insert into company_settings (id, business_name, address, gst_number, bill_prefix, next_bill_number)
values (
  'default',
  'SAI GANGA POLYMER INDUSTRIES',
  'SY.NO.216, H.NO. 3-245, NH 65, opp. M.S.R. Institute, Durajpalle, Suryapet, Telangana 508213',
  '36ALRPB5625Q2ZG',
  'SG-',
  1
)
on conflict (id) do nothing;

-- =========================================================================
-- 2. Bills table
-- =========================================================================
create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  bill_number text not null unique,
  bill_date date not null default current_date,
  customer_id uuid references customers(id) on delete set null,
  customer_name text not null,
  customer_address text,
  customer_phone text,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  grand_total numeric(12,2) not null default 0,
  status text not null default 'active' check (status in ('active', 'voided')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_bills_updated_at before update on bills
  for each row execute function set_updated_at();

alter table bills enable row level security;
create policy "allow all on bills" on bills for all using (true) with check (true);
grant select, insert, update, delete on bills to anon, authenticated;

-- =========================================================================
-- 3. Link sales_entries to bills
-- =========================================================================
alter table sales_entries
  add column if not exists bill_id uuid references bills(id) on delete set null;

create index if not exists idx_sales_entries_bill_id on sales_entries(bill_id);

-- =========================================================================
-- 4. Atomic Bill Number Generator Function
-- =========================================================================
create or replace function generate_next_bill_number()
returns text
language plpgsql
as $$
declare
  v_prefix text;
  v_num integer;
  v_formatted text;
begin
  select bill_prefix, next_bill_number
  into v_prefix, v_num
  from company_settings
  where id = 'default'
  for update;

  if not found then
    v_prefix := 'SG-';
    v_num := 1;
    insert into company_settings (id, bill_prefix, next_bill_number)
    values ('default', 'SG-', 2);
  else
    update company_settings
    set next_bill_number = next_bill_number + 1,
        updated_at = now()
    where id = 'default';
  end if;

  v_formatted := v_prefix || lpad(v_num::text, 4, '0');
  return v_formatted;
end;
$$;

grant execute on function generate_next_bill_number() to anon, authenticated;
