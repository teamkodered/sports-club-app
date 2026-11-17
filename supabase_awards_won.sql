-- 🏆 Awards won before -- shown under each student when coaches nominate (past registers 2017-2025 +
-- earlier years decided in the app). Names only, for the students on the coach's list.
create or replace function public.kc_awards_won(p_names text[])
returns table (name text, year int, category text, grp text) language sql stable security definer set search_path = public as $$
  select h.winner, h.year, h.category, h.grp from awards_history h
  where (select public.kc_awards_coach()) and lower(trim(h.winner)) = any (select lower(trim(n)) from unnest(p_names) n)
  union all
  select c.winner_name, c.year, c.name, c.grp from awards_categories c
  where (select public.kc_awards_coach()) and c.winner_name is not null
    and c.year < extract(year from current_date)::int
    and lower(trim(c.winner_name)) = any (select lower(trim(n)) from unnest(p_names) n)
$$;
grant execute on function public.kc_awards_won(text[]) to authenticated;
select count(*) as past_awards_on_record from awards_history;
