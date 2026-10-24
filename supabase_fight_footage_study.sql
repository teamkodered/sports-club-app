-- Media > 📚 Study: study videos and links live in fight_footage too, so they
-- share the exact same "who can watch" rules (coach only / athletes in it /
-- specific athletes / whole team) and the existing athlete read policy.
-- kind = 'study' keeps them out of Uploads and View IT. Links have no file.
-- Safe to run more than once.
alter table fight_footage add column if not exists kind text not null default 'fight';
alter table fight_footage add column if not exists link_url text;
alter table fight_footage alter column storage_path drop not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fight_footage_kind_check') then
    alter table fight_footage add constraint fight_footage_kind_check check (kind in ('fight', 'study'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fight_footage_file_or_link_check') then
    alter table fight_footage add constraint fight_footage_file_or_link_check check (storage_path is not null or link_url is not null);
  end if;
end $$;

-- check
select kind, count(*) from fight_footage group by 1;
