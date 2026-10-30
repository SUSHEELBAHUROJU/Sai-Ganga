-- Scrap stock never went down when scrap was recycled.
--
-- scrap_stock has shown consumed_kg = 0 since 20260730100000 dropped
-- recycling_entries.scrap_consumed_kg: only granules produced are entered, so
-- every kg of scrap ever bought (or swept up as factory waste) stayed "in
-- stock" forever.
--
-- The scrap a batch used is worked back from what it produced and the scrap
-- type's recycling loss (Settings → Scrap Types), the same rule the stock
-- check report already prices granules by:
--
--   scrap used = granules ÷ (1 − loss %)      e.g. 90 kg at 10% loss → 100 kg
--
-- Like every stock figure here it is computed live from the entries, so it
-- covers all recycling already recorded, and editing or deleting a recycling
-- entry — or changing a scrap type's loss % — moves scrap stock with it.

create or replace view scrap_stock
  with (security_invoker = true) as
select
  t.id as scrap_type_id,
  t.name,
  t.is_active,
  coalesce(ob.quantity, 0) as opening_kg,
  coalesce(sp.total, 0) as purchased_kg,
  coalesce(fw.total, 0) as factory_waste_kg,
  coalesce(rc.scrap_used, 0) as consumed_kg,
  coalesce(ob.quantity, 0) + coalesce(sp.total, 0) + coalesce(fw.total, 0) - coalesce(rc.scrap_used, 0)
    as current_stock,
  lst.min_quantity as low_stock_threshold,
  lst.min_quantity is not null
    and (
      coalesce(ob.quantity, 0) + coalesce(sp.total, 0) + coalesce(fw.total, 0) - coalesce(rc.scrap_used, 0)
    ) < lst.min_quantity
    as is_low_stock,
  -- Granules made from this scrap and the loss % applied — so screens can
  -- show how consumed_kg was arrived at.
  coalesce(rc.granules, 0) as recycled_output_kg,
  t.loss_pct
from scrap_types t
left join opening_balances ob on ob.item_type = 'scrap' and ob.item_id = t.id
left join (
  select scrap_type_id, sum(quantity_kg) as total from scrap_purchases group by scrap_type_id
) sp on sp.scrap_type_id = t.id
left join (
  select scrap_type_id, sum(quantity_kg) as total from factory_waste_entries group by scrap_type_id
) fw on fw.scrap_type_id = t.id
left join (
  select
    re.source_scrap_type_id,
    sum(re.total_output_kg) as granules,
    round(sum(re.total_output_kg) / (1 - st.loss_pct / 100), 2) as scrap_used
  from recycling_entries re
  join scrap_types st on st.id = re.source_scrap_type_id
  where re.output_mode = 'granules' and re.total_output_kg > 0
  group by re.source_scrap_type_id, st.loss_pct
) rc on rc.source_scrap_type_id = t.id
left join low_stock_thresholds lst on lst.item_type = 'scrap' and lst.item_id = t.id;

grant select on scrap_stock to authenticated;
