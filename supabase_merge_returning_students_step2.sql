-- STEP 2: merge the 3 returning students (old July-import record -> current record)
begin;

create temp table merge_map (old_id uuid, new_id uuid) on commit drop;
insert into merge_map values
  ('71e9841c-803a-4c12-af8a-7bc4f5ab0040', 'a702668f-1e6e-4cff-97db-6bd4c98b6f9f'),  -- Haiza-Noor Ghufar
  ('ccfbcf1f-fa31-4da1-9b2f-73fad074c183', '37806af7-bc20-4acc-ac65-be4a91c2a4de'),  -- Max Sobanski
  ('891929e1-777a-4f73-96af-8dcd44bb4fca', '0489f911-b13b-41e1-af5f-da0478d59a1f');  -- Tremayne Miller

-- 1) original join date onto the current record
update members n set joined_date = o.joined_date
from merge_map mm join members o on o.id = mm.old_id
where n.id = mm.new_id and o.joined_date < n.joined_date;

-- 2) their original membership forms move across (kept as history)
update membership_forms f set member_id = mm.new_id
from merge_map mm where f.member_id = mm.old_id;

-- 3) remove the old records (nothing else is attached to them)
delete from students where member_id in (select old_id from merge_map);
delete from members  where id        in (select old_id from merge_map);

-- check: 3 rows, original join dates, forms now 2 each (or more)
select trim(m.first_name || ' ' || m.last_name) as name, m.joined_date, m.status,
       (select count(*) from membership_forms f where f.member_id = m.id) as forms,
       (select count(*) from members x where lower(trim(x.first_name)) = lower(trim(m.first_name))
          and lower(trim(x.last_name)) = lower(trim(m.last_name)) and x.date_of_birth = m.date_of_birth) as records_left
from members m where m.id in (select new_id from merge_map);

commit;
