-- Move from "Phase 1: single-user, wide open" to real authentication.
--
-- Every table so far has an "allow all" RLS policy (`using (true)`) and is
-- granted to the `anon` role — meaning anyone holding the public anon key
-- (which is *always* visible in a client-side app, by design) can read or
-- write all business data with no login at all. That was an accepted,
-- documented tradeoff for local-only development; it is not acceptable once
-- this is reachable on the internet.
--
-- From here on: only Supabase Auth users (`authenticated` role) may touch
-- any table, view, or RPC. `anon` is left with no data access whatsoever.
-- All authenticated users see the same shared business data (this is a
-- small-team shared inventory, not per-user siloed data) — access control is
-- "are you one of ours," not "is this your row."

-- =========================================================================
-- Revoke anon's access
-- =========================================================================

revoke select, insert, update, delete on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;

alter default privileges in schema public
  revoke select, insert, update, delete on tables from anon;

-- =========================================================================
-- Replace every "allow all" RLS policy with "must be signed in"
-- =========================================================================

do $$
declare
  pol record;
  t text;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy %I on %I.%I;', pol.policyname, pol.schemaname, pol.tablename);
  end loop;

  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format(
      'create policy "must be signed in" on %I for all using (auth.uid() is not null) with check (auth.uid() is not null);',
      t
    );
  end loop;
end $$;

-- =========================================================================
-- Re-confirm authenticated still has what it needs (belt and suspenders —
-- these grants already existed, but state them explicitly here so this
-- migration is a complete, self-contained description of the new access
-- model rather than relying on earlier migrations for half the picture).
-- =========================================================================

grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

grant execute on function add_production_quantity(date, uuid, numeric, text) to authenticated;
grant execute on function add_sales_quantity(date, uuid, uuid, numeric, text) to authenticated;
grant execute on function add_recycling_direct_to_pipe(date, uuid, uuid, numeric, numeric, text)
  to authenticated;
grant execute on function add_production_quantities_batch(jsonb) to authenticated;
grant execute on function add_sales_quantities_batch(jsonb) to authenticated;
