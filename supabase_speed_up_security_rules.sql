-- ════════════════════════════════════════════════════════════════════════
-- SPEED UP SECURITY RULES
-- The rules call checks like kc_is_staff() directly, so the database runs them once for
-- EVERY ROW it looks at. Wrapping them as ( SELECT kc_is_staff() ) makes it run them once
-- per query instead. Same rules, same result -- just checked once.
-- Originals are saved first (policy_backup_20261030) so it can be undone.
-- ════════════════════════════════════════════════════════════════════════

-- 1) Back up every rule as it is now
create table if not exists public.policy_backup_20261030 as
select schemaname, tablename, policyname, cmd, qual, with_check, now() as backed_up_at
from pg_policies where schemaname = 'public';

-- 2) Rewrite them
do $$
declare
  p record; new_qual text; new_check text; sql text; n int := 0;
  fn_re  constant text := '(?<!SELECT )\m(kc_is_staff|kc_is_class_staff|kc_is_any_staff|kc_athlete_access)\(\)';
  role_re constant text := '(?<!SELECT )\mkc_has_role\((ARRAY\[[^\]]*\](::text\[\])?)\)';
  uid_re constant text := '(?<!SELECT )\mauth\.uid\(\)';
begin
  for p in select * from pg_policies where schemaname = 'public' loop
    new_qual := p.qual; new_check := p.with_check;
    if new_qual is not null then
      new_qual := regexp_replace(new_qual, fn_re, '( SELECT \1())', 'g');
      new_qual := regexp_replace(new_qual, role_re, '( SELECT kc_has_role(\1))', 'g');
      new_qual := regexp_replace(new_qual, uid_re, '( SELECT auth.uid())', 'g');
    end if;
    if new_check is not null then
      new_check := regexp_replace(new_check, fn_re, '( SELECT \1())', 'g');
      new_check := regexp_replace(new_check, role_re, '( SELECT kc_has_role(\1))', 'g');
      new_check := regexp_replace(new_check, uid_re, '( SELECT auth.uid())', 'g');
    end if;
    if new_qual is distinct from p.qual or new_check is distinct from p.with_check then
      sql := format('alter policy %I on public.%I', p.policyname, p.tablename);
      if new_qual  is not null then sql := sql || format(' using (%s)', new_qual); end if;
      if new_check is not null then sql := sql || format(' with check (%s)', new_check); end if;
      execute sql;
      n := n + 1;
    end if;
  end loop;
  raise notice 'Rules updated: %', n;
end $$;

-- 3) Check: how many rules now use the quick form, and that none are left the slow way
select count(*) filter (where coalesce(qual, '') || coalesce(with_check, '') ~ '\( SELECT (kc_|auth\.uid)') as rules_sped_up,
       count(*) filter (where coalesce(qual, '') || coalesce(with_check, '') ~ '(?<!SELECT )\m(kc_is_staff|kc_is_class_staff|kc_athlete_access|kc_has_role)\(') as still_slow
from pg_policies where schemaname = 'public';

-- UNDO (only if ever needed): puts every rule back exactly as it was
-- do $$ declare b record; s text; begin
--   for b in select * from public.policy_backup_20261030 loop
--     s := format('alter policy %I on public.%I', b.policyname, b.tablename);
--     if b.qual is not null then s := s || format(' using (%s)', b.qual); end if;
--     if b.with_check is not null then s := s || format(' with check (%s)', b.with_check); end if;
--     execute s;
--   end loop; end $$;
