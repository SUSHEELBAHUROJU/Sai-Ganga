-- Widen recycling_entries.scrap_source to the three sources the Log
-- Recycling screen offers (Factory Waste / Scrap Dealer / Other), and
-- simplify raw_material_purchases.entry_mode to two modes ("bag" — actual
-- bag size lives in pack_kg — vs "direct_kg"), matching how
-- raw_material_types.default_pack_kg already represents pack size.

alter table recycling_entries
  drop constraint recycling_entries_scrap_source_check;
alter table recycling_entries
  add constraint recycling_entries_scrap_source_check
  check (scrap_source in ('factory_waste', 'scrap_dealer', 'other'));

alter table raw_material_purchases
  drop constraint raw_material_purchases_entry_mode_check;
alter table raw_material_purchases
  add constraint raw_material_purchases_entry_mode_check
  check (entry_mode in ('bag', 'direct_kg'));
