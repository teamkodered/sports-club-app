-- ════════════════════════════════════════════════════════════════════════
-- MARKETING STAGE 1: CAMPAIGNS
-- • campaigns: each ad / flyer / open day, its dates, spend and short code (admin only)
-- • enquiries.campaign_id: which campaign an enquiry came from
-- • membership_forms.campaign_code: the code from the join link they used
-- • new enquiries are tagged automatically when their Facebook form / ad name
--   contains a campaign's "match text" and the date is inside the campaign dates
-- Safe to run again. Nothing existing is changed or deleted.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  channel text not null default 'facebook',    -- facebook / instagram / google / flyer / event / school / other
  code text unique,                            -- short code used in join links (?c=code) and as a promo code
  match_text text,                             -- text in the Facebook form / ad name, e.g. 'Junior Advert'
  starts_on date,
  ends_on date,
  spend numeric(10,2) not null default 0,
  grp text,                                    -- PKA kids / PKA adults / KRBA / KR / all
  venue text,                                  -- kr-centre / derby-moore / moorways / alvaston / null = all
  notes text,
  archived boolean not null default false
);
alter table public.campaigns enable row level security;
drop policy if exists campaigns_admin on public.campaigns;
create policy campaigns_admin on public.campaigns for all
  using (public.kc_has_role(array['admin'])) with check (public.kc_has_role(array['admin']));

alter table public.enquiries        add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;
alter table public.membership_forms add column if not exists campaign_code text;
create index if not exists enquiries_campaign_idx on public.enquiries (campaign_id);

-- Which campaign (if any) an enquiry's notes + date point to. The longest match text wins.
create or replace function public.kc_campaign_for(p_notes text, p_date date)
returns uuid language sql stable security definer set search_path = public as $$
  select c.id from campaigns c
  where not c.archived
    and length(trim(coalesce(c.match_text, ''))) >= 3
    and position(lower(trim(c.match_text)) in lower(coalesce(p_notes, ''))) > 0
    and (c.starts_on is null or p_date is null or p_date >= c.starts_on)
    and (c.ends_on   is null or p_date is null or p_date <= c.ends_on)
  order by length(c.match_text) desc
  limit 1
$$;

-- New enquiries (Facebook webhook, CSV import, typed in) get tagged as they arrive
create or replace function public.kc_enquiry_campaign_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.campaign_id is null then
    new.campaign_id := public.kc_campaign_for(new.notes, new.enquiry_date);
  end if;
  return new;
end $$;
drop trigger if exists kc_enquiry_campaign on public.enquiries;
create trigger kc_enquiry_campaign before insert on public.enquiries
  for each row execute function public.kc_enquiry_campaign_trg();

-- Admin button "Tag older enquiries": tags enquiries that don't have a campaign yet.
-- Never changes one that's already tagged (by hand or otherwise).
create or replace function public.kc_campaign_tag_existing()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.kc_has_role(array['admin']) then raise exception 'Admins only'; end if;
  update enquiries e set campaign_id = public.kc_campaign_for(e.notes, e.enquiry_date)
  where e.campaign_id is null and public.kc_campaign_for(e.notes, e.enquiry_date) is not null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.kc_campaign_tag_existing() from public, anon;
grant execute on function public.kc_campaign_tag_existing() to authenticated;
revoke all on function public.kc_campaign_for(text, date) from public, anon;

-- Check: should list the new table with RLS on, and the two new columns
select 'campaigns' as what, relrowsecurity::text as rls_on from pg_class where relname = 'campaigns'
union all
select table_name || '.' || column_name, 'column added' from information_schema.columns
where table_schema = 'public' and column_name in ('campaign_id', 'campaign_code');
