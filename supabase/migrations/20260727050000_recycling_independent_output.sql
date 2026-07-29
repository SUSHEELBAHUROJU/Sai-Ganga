-- Granule output is an independently entered figure, not a function of scrap
-- consumed. Recycling always loses some material to waste/shortage, so
-- scrap_consumed_kg and total_output_kg are unrelated numbers and neither is
-- derived from the other.
--
-- total_output_kg stays NOT NULL — it is the authoritative output figure and
-- what raw_material_stock reads. output_pack_kg / num_bags become nullable
-- because they only apply when the user entered output by the bag; in
-- 'direct_kg' mode they carry no meaning and must not be invented.

alter table recycling_entries
  add column output_entry_mode text not null default 'bag'
  check (output_entry_mode in ('bag', 'direct_kg'));

alter table recycling_entries alter column output_pack_kg drop not null;
alter table recycling_entries alter column output_pack_kg drop default;
alter table recycling_entries alter column num_bags drop not null;

-- Bag-mode rows must carry the pack size and count they were built from;
-- direct rows must not pretend to have them.
alter table recycling_entries
  add constraint recycling_entries_output_mode_fields_check
  check (
    (output_entry_mode = 'bag' and output_pack_kg is not null and num_bags is not null)
    or
    (output_entry_mode = 'direct_kg' and output_pack_kg is null and num_bags is null)
  );

comment on column recycling_entries.total_output_kg is
  'Granules produced, entered independently of scrap_consumed_kg. The gap between the two is waste/shortage.';
