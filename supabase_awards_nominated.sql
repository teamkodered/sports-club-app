-- 🎖 Who's already nominated this year (any award, any group, any coach) -- shown in the nominate list
-- so coaches can see a student's nominations elsewhere. Award + group + how many nominations; not who.
create or replace function public.kc_awards_nominated(p_year int, p_students uuid[])
returns table (student_id uuid, category text, grp text, times bigint) language sql stable security definer set search_path = public as $$
  select n.student_id, c.name, c.grp, count(*)
  from awards_nominations n join awards_categories c on c.id = n.category_id
  where (select public.kc_awards_coach()) and c.year = p_year and n.student_id = any (p_students)
  group by n.student_id, c.name, c.grp
$$;
grant execute on function public.kc_awards_nominated(int, uuid[]) to authenticated;
select 'ok' as done;
