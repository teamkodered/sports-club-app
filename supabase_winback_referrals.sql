-- ════════════════════════════════════════════════════════════════════════
-- MARKETING STAGE 2: WIN BACK + REFERRALS
-- • members.referral_code: each member's own "bring a friend" code (e.g. kr3f9a2)
--   -- no names in it, so it's safe for children's accounts too
-- • referrals: credited automatically when a new member is approved and their join form had
--   that code (typed as a promo code, or from the member's share link)
-- • enquiries.do_not_contact: opt-out for enquiries (members already have do_not_contact)
-- • winback_log: who was messaged from which Win back list, and when
-- Safe to run again. Nothing existing is changed or deleted.
-- ════════════════════════════════════════════════════════════════════════

-- 1. Referral codes
alter table public.members add column if not exists referral_code text;
create unique index if not exists members_referral_code_key on public.members (referral_code);

create or replace function public.kc_new_referral_code(p_id uuid) returns text
language plpgsql volatile set search_path = public as $$
declare c text; n int := 0;
begin
  loop
    c := 'kr' || substr(md5(p_id::text || n::text), 1, 5);
    exit when not exists (select 1 from members where referral_code = c);
    n := n + 1;
  end loop;
  return c;
end $$;

update public.members set referral_code = public.kc_new_referral_code(id) where referral_code is null;

create or replace function public.kc_member_referral_code_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.referral_code is null then new.referral_code := public.kc_new_referral_code(coalesce(new.id, gen_random_uuid())); end if;
  return new;
end $$;
drop trigger if exists kc_member_referral_code on public.members;
create trigger kc_member_referral_code before insert on public.members
  for each row execute function public.kc_member_referral_code_trg();

-- 2. Referrals
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  referrer_member_id uuid not null references public.members(id) on delete cascade,
  new_member_id uuid not null unique references public.members(id) on delete cascade,
  code text,
  reward_given boolean not null default false,
  notes text
);
alter table public.referrals enable row level security;
drop policy if exists referrals_admin on public.referrals;
create policy referrals_admin on public.referrals for all
  using (public.kc_has_role(array['admin'])) with check (public.kc_has_role(array['admin']));
drop policy if exists referrals_own on public.referrals;
create policy referrals_own on public.referrals for select
  using (referrer_member_id in (select id from members where auth_id = auth.uid()));

-- credit the referrer when the new member is approved
create or replace function public.kc_referral_credit_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_code text; v_ref uuid;
begin
  if new.status = 'active' and (tg_op = 'INSERT' or coalesce(old.status, '') <> 'active') then
    select lower(trim(c)) into v_code
    from membership_forms f, unnest(array[f.promo_code, f.campaign_code]) c
    where f.member_id = new.id and coalesce(trim(c), '') <> ''
      and exists (select 1 from members m where m.referral_code = lower(trim(c)) and m.id <> new.id)
    order by f.submitted_at desc nulls last
    limit 1;
    if v_code is not null then
      select id into v_ref from members where referral_code = v_code;
      insert into referrals (referrer_member_id, new_member_id, code) values (v_ref, new.id, v_code)
      on conflict (new_member_id) do nothing;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists kc_referral_credit on public.members;
create trigger kc_referral_credit after insert or update of status on public.members
  for each row execute function public.kc_referral_credit_trg();

-- 3. Opt-out for enquiries
alter table public.enquiries add column if not exists do_not_contact boolean not null default false;

-- 4. Win back message log
create table if not exists public.winback_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sent_by uuid default auth.uid(),
  list text not null,                      -- stopped / not_started / trial / cold
  member_id uuid references public.members(id) on delete cascade,
  enquiry_id uuid references public.enquiries(id) on delete cascade,
  channel text                             -- email / whatsapp
);
alter table public.winback_log enable row level security;
drop policy if exists winback_log_admin on public.winback_log;
create policy winback_log_admin on public.winback_log for all
  using (public.kc_has_role(array['admin'])) with check (public.kc_has_role(array['admin']));

-- Check: how many members now have a code, and RLS on the two new tables
select 'members with a referral code' as what, count(*)::text as value from members where referral_code is not null
union all select 'referrals rls', relrowsecurity::text from pg_class where relname = 'referrals'
union all select 'winback_log rls', relrowsecurity::text from pg_class where relname = 'winback_log';
