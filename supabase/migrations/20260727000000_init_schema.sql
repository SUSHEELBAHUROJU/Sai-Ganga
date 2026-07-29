-- Phase 1: Inventory Management schema for LDPE pipe manufacturing business
-- Master data, transactional entries, and stock-adjustment tables.
-- created_by/timestamps are included on every table so multi-user support
-- (Supabase Auth) can be layered on later without a schema migration.

create extension if not exists "pgcrypto";

-- Generic trigger to keep updated_at current on every row change.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =========================================================================
-- Master data
-- =========================================================================

create table pipe_products (
  id uuid primary key default gen_random_uuid(),
  diameter_inches numeric(6,2) not null,
  weight_kg numeric(6,2) not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (diameter_inches, weight_kg)
);

create table raw_material_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_pack_kg numeric(6,2),
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table scrap_dealers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================================
-- Transactional entries
-- =========================================================================

create table production_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  pipe_product_id uuid not null references pipe_products(id),
  quantity numeric(10,2) not null,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sales_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  customer_id uuid references customers(id),
  pipe_product_id uuid not null references pipe_products(id),
  quantity numeric(10,2) not null,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table recycling_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  scrap_source text not null check (scrap_source in ('factory_waste', 'purchased_scrap')),
  scrap_consumed_kg numeric(10,2) not null,
  output_pack_kg numeric(6,2) not null default 25,
  num_bags numeric(10,2) not null,
  total_output_kg numeric(10,2) not null,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table raw_material_purchases (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  raw_material_type_id uuid not null references raw_material_types(id),
  supplier_name text,
  entry_mode text not null check (entry_mode in ('bag_25kg', 'bag_50kg', 'direct_kg')),
  pack_kg numeric(6,2),
  num_bags numeric(10,2),
  total_qty_kg numeric(10,2) not null,
  cost numeric(10,2),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table scrap_purchases (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  scrap_dealer_id uuid references scrap_dealers(id),
  quantity_kg numeric(10,2) not null,
  cost numeric(10,2),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table factory_waste_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  quantity_kg numeric(10,2) not null,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================================
-- Stock adjustment / configuration tables
-- item_type identifies which master-data table item_id belongs to.
-- Kept polymorphic (no FK) since it can point to pipe_products or
-- raw_material_types (recycled granules are tracked as a raw_material_type).
-- =========================================================================

create table opening_balances (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('pipe_product', 'raw_material')),
  item_id uuid not null,
  quantity numeric(10,2) not null,
  unit text not null check (unit in ('pcs', 'kg', 'bags')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_type, item_id)
);

create table low_stock_thresholds (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('pipe_product', 'raw_material')),
  item_id uuid not null,
  min_quantity numeric(10,2) not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_type, item_id)
);

-- =========================================================================
-- updated_at triggers
-- =========================================================================

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'pipe_products', 'raw_material_types', 'customers', 'scrap_dealers',
      'production_entries', 'sales_entries', 'recycling_entries',
      'raw_material_purchases', 'scrap_purchases', 'factory_waste_entries',
      'opening_balances', 'low_stock_thresholds'
    ])
  loop
    execute format(
      'create trigger set_updated_at before update on %I for each row execute function set_updated_at();',
      t
    );
  end loop;
end $$;

-- =========================================================================
-- Indexes for common lookups / date filtering (used by Records & Reports)
-- =========================================================================

create index idx_production_entries_date on production_entries (entry_date desc);
create index idx_sales_entries_date on sales_entries (entry_date desc);
create index idx_recycling_entries_date on recycling_entries (entry_date desc);
create index idx_raw_material_purchases_date on raw_material_purchases (entry_date desc);
create index idx_scrap_purchases_date on scrap_purchases (entry_date desc);
create index idx_factory_waste_entries_date on factory_waste_entries (entry_date desc);

create index idx_sales_entries_customer on sales_entries (customer_id);
create index idx_scrap_purchases_dealer on scrap_purchases (scrap_dealer_id);
create index idx_raw_material_purchases_type on raw_material_purchases (raw_material_type_id);

-- =========================================================================
-- Row Level Security
-- Single-user phase: permissive "allow all" policies so the app works
-- without auth wired up yet. Tighten to auth.uid() = created_by once
-- multi-user auth is introduced in a later phase.
-- =========================================================================

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'pipe_products', 'raw_material_types', 'customers', 'scrap_dealers',
      'production_entries', 'sales_entries', 'recycling_entries',
      'raw_material_purchases', 'scrap_purchases', 'factory_waste_entries',
      'opening_balances', 'low_stock_thresholds'
    ])
  loop
    execute format('alter table %I enable row level security;', t);
    execute format(
      'create policy "allow all (phase 1, single user)" on %I for all using (true) with check (true);',
      t
    );
  end loop;
end $$;
