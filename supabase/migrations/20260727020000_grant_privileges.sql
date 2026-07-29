-- RLS policies restrict access but don't grant it — Postgres still requires
-- explicit GRANTs before the anon/authenticated roles can touch these tables
-- at all. Phase 1 is single-user with permissive "allow all" RLS policies,
-- so mirror that here; tighten alongside the RLS policies once auth lands.

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
