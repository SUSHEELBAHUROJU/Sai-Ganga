-- Purchase enhancement: structured supplier for raw-material purchases (same
-- pattern as scrap_dealers), transport charges on both purchase tables, and
-- a going-forward requirement that a purchase records what it cost.

-- =========================================================================
-- 1. raw_material_suppliers — same shape as scrap_dealers, so raw-material
--    purchases can carry a structured supplier the same conceptual way
--    Sales already carries a structured customer. Kept as its own table
--    rather than merged with scrap_dealers: raw-material and scrap already
--    have separate type tables (raw_material_types / scrap_types), and a
--    supplier here is a different real-world counterparty than a scrap
--    dealer even when the same business happens to be both.
-- =========================================================================
create table raw_material_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_raw_material_suppliers_updated_at before update on raw_material_suppliers
  for each row execute function set_updated_at();

-- This table is created after 20260731000000_require_authentication.sql, so
-- it isn't swept up by that migration's dynamic policy loop — lock it down
-- explicitly here, same posture as ledger_transactions (authenticated only).
alter table raw_material_suppliers enable row level security;
create policy "must be signed in" on raw_material_suppliers
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

revoke all on raw_material_suppliers from public, anon;
grant select, insert, update, delete on raw_material_suppliers to authenticated;

-- Same normalized-phone uniqueness as customers (20260802000000), reusing
-- that migration's normalize_phone() rather than redefining it.
create unique index raw_material_suppliers_phone_unique
  on raw_material_suppliers (normalize_phone(phone))
  where phone is not null and phone <> '' and normalize_phone(phone) <> '';

-- =========================================================================
-- 2. raw_material_purchases — link to the new supplier table. The legacy
--    free-text supplier_name column is kept exactly as-is: old rows keep
--    showing whatever was typed, and anything that still reads that column
--    (Records, CSV backup) falls back to it when supplier_id is null.
-- =========================================================================
alter table raw_material_purchases
  add column supplier_id uuid references raw_material_suppliers(id);

create index idx_raw_material_purchases_supplier on raw_material_purchases (supplier_id);

-- =========================================================================
-- 3. Transport charges — separate from the purchase price on both purchase
--    tables, mirroring bills.transport_charges (20260805000000): its own
--    column, not folded into cost, so "purchase cost" and "total purchase
--    cost (cost + transport)" stay distinguishable everywhere they're read.
-- =========================================================================
alter table raw_material_purchases
  add column transport_charges numeric(10,2) not null default 0;

alter table scrap_purchases
  add column transport_charges numeric(10,2) not null default 0;

-- =========================================================================
-- 4. Purchase price becomes mandatory going forward. NOT VALID: existing
--    rows with cost = null (recorded before this requirement existed) are
--    left exactly as they are — this only binds new inserts and any future
--    update to an old row, never retroactively rewrites history.
-- =========================================================================
alter table raw_material_purchases
  add constraint raw_material_purchases_cost_required check (cost is not null) not valid;

alter table scrap_purchases
  add constraint scrap_purchases_cost_required check (cost is not null) not valid;
