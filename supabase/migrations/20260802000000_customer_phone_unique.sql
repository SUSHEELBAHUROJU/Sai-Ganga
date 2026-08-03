-- One phone number = one customer, so the same person/shop can't get added
-- twice by accident. Enforced via a normalized functional index rather than
-- a plain unique constraint on the raw text, because the same real number
-- can be typed as "9876543210", "+91 98765 43210", or "098765-43210" — all
-- of those must collide. Multiple customers with no phone at all are still
-- fine (the index only covers non-blank phone values).

create or replace function normalize_phone(raw text)
returns text
language sql
immutable
as $$
  select right(regexp_replace(coalesce(raw, ''), '\D', '', 'g'), 10);
$$;

revoke execute on function normalize_phone(text) from public;
grant execute on function normalize_phone(text) to authenticated;

-- The normalize_phone(phone) <> '' guard excludes phone values with no
-- digits at all (e.g. someone typing "N/A") from the uniqueness check —
-- otherwise every such garbage entry would collide on the empty string.
create unique index customers_phone_unique
  on customers (normalize_phone(phone))
  where phone is not null and phone <> '' and normalize_phone(phone) <> '';
