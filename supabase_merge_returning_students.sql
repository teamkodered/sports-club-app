-- MERGE 3 RETURNING STUDENTS: keep the new (Sept) record, give it the original join date,
-- remove the old July-import record.
--   Haiza-Noor Ghufar  old 71e9841c… (joined 2023-05-22) -> new a702668f…
--   Max Sobanski       old ccfbcf1f… (joined 2024-06-17) -> new 37806af7…
--   Tremayne Miller    old 891929e1… (joined 2021-05-01) -> new 0489f911…

-- ── STEP 1 (read-only): is anything else attached to the OLD records? ──
with old_m(id) as (values ('71e9841c-803a-4c12-af8a-7bc4f5ab0040'::uuid), ('ccfbcf1f-fa31-4da1-9b2f-73fad074c183'::uuid), ('891929e1-777a-4f73-96af-8dcd44bb4fca'::uuid)),
old_s as (select s.id from students s where s.member_id in (select id from old_m)),
refs as (
  select c.conrelid::regclass::text as tbl, a.attname as col, c.confrelid::regclass::text as points_to
  from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.contype = 'f' and c.confrelid in ('public.students'::regclass, 'public.members'::regclass)
)
select tbl, col, points_to,
  (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %s where %I in (%s)', tbl, col,
     case when points_to = 'students'
          then (select coalesce(string_agg(quote_literal(id), ','), 'null') from old_s)
          else (select string_agg(quote_literal(id), ',') from old_m) end), false, true, '')))[1]::text::int as rows_on_old_records
from refs
order by rows_on_old_records desc, tbl;
-- Send Claude this result before Step 2 (anything other than students/members with rows > 0
-- will be moved across to the new record first).
