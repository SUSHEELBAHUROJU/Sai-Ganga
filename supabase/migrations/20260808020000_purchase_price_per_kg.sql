-- Purchases are priced per kilogram, not as a lump sum: the owner knows the
-- rate they agreed with the supplier, and the amount payable follows from it.
--
-- `cost` keeps its existing meaning — the total paid for the goods — so every
-- existing read (reports, CSV export, daily report, records) is unaffected.
-- What changes is where that number comes from: the app now computes
-- cost = round(price_per_kg * quantity, 2) instead of asking for it directly,
-- and stores the rate that produced it so a later edit can recompute the total
-- when the quantity changes.

alter table raw_material_purchases
  add column price_per_kg numeric(10,2);

alter table scrap_purchases
  add column price_per_kg numeric(10,2);

comment on column raw_material_purchases.price_per_kg is
  'Agreed rate per kg. cost = round(price_per_kg * total_qty_kg, 2); cost stays authoritative for money totals.';
comment on column scrap_purchases.price_per_kg is
  'Agreed rate per kg. cost = round(price_per_kg * quantity_kg, 2); cost stays authoritative for money totals.';

-- Backfill the effective rate for rows that already record a total, so old
-- purchases show a per-kg figure too. Rows with no cost (recorded before a
-- price was required) stay null — there is nothing to derive it from, and
-- inventing a rate would be worse than showing none.
update raw_material_purchases
  set price_per_kg = round(cost / total_qty_kg, 2)
  where cost is not null and total_qty_kg > 0 and price_per_kg is null;

update scrap_purchases
  set price_per_kg = round(cost / quantity_kg, 2)
  where cost is not null and quantity_kg > 0 and price_per_kg is null;

-- Deliberately no NOT NULL / check constraint here: `cost` already carries the
-- "a purchase must record what it cost" rule (20260808000000), and the rate is
-- derived input rather than a second source of truth for money.
