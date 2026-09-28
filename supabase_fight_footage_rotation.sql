-- Fight footage: per-clip display rotation (applied at playback, the
-- file itself is never re-encoded). Run once in the Supabase SQL editor.
alter table fight_footage
  add column if not exists rotation smallint not null default 0;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fight_footage_rotation_check') then
    alter table fight_footage add constraint fight_footage_rotation_check check (rotation in (0, 90, 180, 270));
  end if;
end $$;
