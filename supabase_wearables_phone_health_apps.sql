-- Phone health apps (Apple Health, Samsung Health / Health Connect) have no
-- web API: data has to be SENT to us from the phone. Each athlete gets a
-- private link code per provider; the phone posts to the wearable-ingest
-- edge function with that code. Safe to run more than once.

alter table public.wearable_connections add column if not exists ingest_token text;
create unique index if not exists wearable_connections_ingest_token_idx on public.wearable_connections (ingest_token) where ingest_token is not null;

-- Called by the signed-in athlete from the app: creates (or returns) their
-- link code for a provider. Never exposes anyone else's.
create or replace function public.create_wearable_link(p_provider text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
  v_token text;
begin
  select s.id into v_student
    from students s join members m on m.id = s.member_id
    where m.auth_id = auth.uid() limit 1;
  if v_student is null then raise exception 'No student record for this login'; end if;
  if p_provider not in ('apple_health', 'samsung_health', 'health_connect') then raise exception 'Unsupported provider'; end if;

  select ingest_token into v_token from wearable_connections
    where student_id = v_student and provider = p_provider;
  if v_token is null then
    v_token := encode(gen_random_bytes(18), 'hex');
    insert into wearable_connections (student_id, provider, ingest_token, status, updated_at)
      values (v_student, p_provider, v_token, 'active', now())
      on conflict (student_id, provider) do update set ingest_token = excluded.ingest_token, status = 'active', updated_at = now();
  end if;
  return v_token;
end;
$$;
grant execute on function public.create_wearable_link(text) to authenticated;

-- Athlete-readable copy of their own link code (so the app can show it again)
create or replace function public.my_wearable_link(p_provider text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.ingest_token from wearable_connections c
    join students s on s.id = c.student_id join members m on m.id = s.member_id
    where m.auth_id = auth.uid() and c.provider = p_provider limit 1;
$$;
grant execute on function public.my_wearable_link(text) to authenticated;
