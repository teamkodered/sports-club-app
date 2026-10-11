-- Head Coach: his venue's standing-order statements (Derby Moore payments are separate from KR's).
--  • standing_order_uploads.venue: blank = KR Centre; a head coach's uploads get his venue
--  • a head coach sees / works only his venue's uploads; staff see all (unchanged)
alter table public.standing_order_uploads add column if not exists venue text;

create or replace function public.kc_trg_so_upload_venue()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.venue is null and public.kc_is_head_coach() then new.venue := (select v from public.kc_my_venues() v limit 1); end if;
  return new;
end $$;
drop trigger if exists kc_so_upload_venue on public.standing_order_uploads;
create trigger kc_so_upload_venue before insert on public.standing_order_uploads
  for each row execute function public.kc_trg_so_upload_venue();

alter table public.standing_order_uploads enable row level security;
drop policy if exists so_uploads_coach_read on public.standing_order_uploads;
drop policy if exists so_uploads_coach_insert on public.standing_order_uploads;
drop policy if exists so_uploads_coach_update on public.standing_order_uploads;
create policy so_uploads_coach_read on public.standing_order_uploads for select
  using (public.kc_is_head_coach() and venue in (select public.kc_my_venues()));
create policy so_uploads_coach_insert on public.standing_order_uploads for insert
  with check (public.kc_is_head_coach());
create policy so_uploads_coach_update on public.standing_order_uploads for update
  using (public.kc_is_head_coach() and venue in (select public.kc_my_venues()));

-- Make sure staff can still use the table exactly as before (only adds a rule if none existed for them)
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'standing_order_uploads' and policyname not like 'so_uploads_coach_%') then
    execute $p$create policy so_uploads_staff on public.standing_order_uploads for all using (public.kc_has_role(array['admin','captain','coach','leader'])) with check (public.kc_has_role(array['admin','captain','coach','leader']))$p$;
  end if;
end $$;
