-- CCTV for team members (Nov 2026): Settings -> Team -> CCTV "View" / "Full" was only
-- checked by the app's screens; the database rule on cctv_clips never looked at it, so
-- coaches / leaders given CCTV access still got NO clips. This adds that rule:
--   CCTV View or Full -> can see all clips;  CCTV Full -> can also change them
--   (flag, allow download, who can see).
-- Same logic as the app (src/lib/access.js): admin = full; someone in a team group gets
-- the GROUP's page settings; otherwise their own. Only ADDS access -- existing rules
-- (admins, athletes' own session footage) are untouched. Safe to run more than once.

create or replace function public.kc_page_access(p_page text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with ag as materialized (
    select case when jsonb_typeof(value::jsonb) = 'array' then value::jsonb else '[]'::jsonb end as groups
    from settings where key = 'access_groups'
  ),
  mine as (
    select m.role, coalesce(m.access::jsonb, '{}'::jsonb) as acc
    from members m where m.auth_id = auth.uid()
  ),
  lvl as (
    select case
      when mine.role = 'admin' then 'edit'
      when mine.acc ? 'group' and exists (
        select 1 from ag, jsonb_array_elements(ag.groups) g where g->>'id' = mine.acc->>'group')
        then coalesce((select g->'access'->'pages'->>p_page from ag, jsonb_array_elements(ag.groups) g
                       where g->>'id' = mine.acc->>'group' limit 1), 'none')
      else coalesce(mine.acc->'pages'->>p_page, 'none')
    end as v
    from mine
  )
  -- one login can have several member records: the highest access wins
  select case when bool_or(v = 'edit') then 'edit' when bool_or(v = 'view') then 'view' else 'none' end from lvl
$$;

grant execute on function public.kc_page_access(text) to authenticated;

drop policy if exists cctv_clips_team_read on cctv_clips;
create policy cctv_clips_team_read on cctv_clips for select to authenticated
  using (public.kc_page_access('cctv') in ('view', 'edit'));

drop policy if exists cctv_clips_team_update on cctv_clips;
create policy cctv_clips_team_update on cctv_clips for update to authenticated
  using (public.kc_page_access('cctv') = 'edit')
  with check (public.kc_page_access('cctv') = 'edit');

-- check: who has CCTV access set (own setting or team group)
select m.first_name, m.last_name, m.role,
       m.access::jsonb->'pages'->>'cctv' as own_cctv,
       m.access::jsonb->>'group' as team_group
from members m
where m.role in ('admin', 'leader', 'captain', 'coach', 'head_coach')
order by m.role, m.first_name;
