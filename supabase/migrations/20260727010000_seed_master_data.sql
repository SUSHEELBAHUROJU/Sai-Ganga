-- Starter master data so the app isn't empty on first run.
-- Idempotent: safe to re-run (e.g. via `supabase db reset`).

insert into raw_material_types (name, default_pack_kg) values
  ('Virgin', 25),
  ('MLD', 25),
  ('LLD', 25),
  ('Recycled Granules', 25)
on conflict (name) do nothing;

insert into pipe_products (diameter_inches, weight_kg) values
  (2, 3), (2, 5), (2, 8), (2, 10),
  (3, 3), (3, 5), (3, 8), (3, 10), (3, 15), (3, 20), (3, 25), (3, 30),
  (4, 5), (4, 8), (4, 10), (4, 15), (4, 20),
  (5, 10), (5, 15), (5, 20), (5, 25),
  (6, 15), (6, 20), (6, 25), (6, 30)
on conflict (diameter_inches, weight_kg) do nothing;
