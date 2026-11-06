-- 🏆 Awards: a class award group can cover a pair of classes (e.g. KR Centre Wed 19:00 + Sun 12:00)
alter table public.awards_categories add column if not exists class_ids uuid[];
notify pgrst, 'reload schema';
select 'ok' as done;
