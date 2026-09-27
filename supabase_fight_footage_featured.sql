-- Fight footage: separate "athletes in this fight" (a label) from
-- "who can watch" (access). Run once in the Supabase SQL editor.
-- Wrapped in a transaction: if any step fails, nothing is changed.

begin;

-- 1. "Athletes in this fight" -- purely descriptive, grants no access.
--    Created from fight_footage_athletes so the column types match exactly.
create table if not exists fight_footage_featured as
  select footage_id, student_id from fight_footage_athletes where false;

alter table fight_footage_featured
  alter column footage_id set not null,
  alter column student_id set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fight_footage_featured_pkey') then
    alter table fight_footage_featured add primary key (footage_id, student_id);
    alter table fight_footage_featured
      add constraint fight_footage_featured_footage_fk foreign key (footage_id) references fight_footage(id) on delete cascade,
      add constraint fight_footage_featured_student_fk foreign key (student_id) references students(id) on delete cascade;
  end if;
end $$;

create index if not exists fight_footage_featured_student_idx on fight_footage_featured(student_id);

-- Backfill: existing athlete tags were set up as "who can watch", which in
-- practice has meant the athletes in the fight. Copy them across as labels.
insert into fight_footage_featured (footage_id, student_id)
  select footage_id, student_id from fight_footage_athletes
  on conflict do nothing;

alter table fight_footage_featured enable row level security;

drop policy if exists fight_footage_featured_staff_all on fight_footage_featured;
create policy fight_footage_featured_staff_all on fight_footage_featured for all
  using (exists (select 1 from members where members.auth_id = auth.uid() and members.role = any (array['admin','captain'])))
  with check (exists (select 1 from members where members.auth_id = auth.uid() and members.role = any (array['admin','captain'])));

-- Athletes see only their own rows. (Deliberately NOT "rows for footage I
-- can see" -- that would reference fight_footage, whose policy references
-- this table, and Postgres rejects that as infinite recursion.)
drop policy if exists fight_footage_featured_own_read on fight_footage_featured;
create policy fight_footage_featured_own_read on fight_footage_featured for select
  using (exists (
    select 1 from students s join members m on m.id = s.member_id
    where s.id = fight_footage_featured.student_id and m.auth_id = auth.uid()
  ));

-- 2. New access mode 'featured' = the athletes in this fight can watch.
--    Drops whatever check constraint currently covers access_mode (name unknown).
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'fight_footage'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%access_mode%'
  loop
    execute format('alter table fight_footage drop constraint %I', c);
  end loop;
end $$;

alter table fight_footage add constraint fight_footage_access_mode_check
  check (access_mode in ('coach_only', 'featured', 'select_athletes', 'all'));

-- 3. Athlete read rule, tightened:
--    - must be published (previously pending 'all' clips leaked to everyone)
--    - tag lists only count for the mode that uses them (previously any
--      tagged athlete could read the clip whatever its access mode)
drop policy if exists fight_footage_athlete_read on fight_footage;
create policy fight_footage_athlete_read on fight_footage for select
  using (
    coalesce(published, false) and (
      access_mode = 'all'
      or (access_mode = 'select_athletes' and exists (
        select 1 from fight_footage_athletes ffa
        join students s on s.id = ffa.student_id
        join members m on m.id = s.member_id
        where ffa.footage_id = fight_footage.id and m.auth_id = auth.uid()
      ))
      or (access_mode = 'featured' and exists (
        select 1 from fight_footage_featured fff
        join students s on s.id = fff.student_id
        join members m on m.id = s.member_id
        where fff.footage_id = fight_footage.id and m.auth_id = auth.uid()
      ))
    )
  );

commit;

-- Check (read-only):
select access_mode, published, count(*) from fight_footage group by 1, 2 order by 1, 2;
select count(*) as featured_rows from fight_footage_featured;
