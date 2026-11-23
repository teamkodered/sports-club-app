-- 📝 REQUEST AN UPDATED FORM: staff make a one-use link (14 days) for a student; the parent opens the join
-- form already filled in from the record, corrects it and re-signs. It saves onto the SAME member / student
-- (start date, attendance, points, grade, house, payments untouched) as a new form on file; older forms are
-- kept, marked superseded.
create table if not exists public.form_update_requests (
  token text primary key default encode(gen_random_bytes(16), 'hex'),
  member_id uuid not null, student_id uuid, form_type text not null,
  created_by uuid, created_by_name text, created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '14 days', used_at timestamptz
);
alter table public.form_update_requests enable row level security;
drop policy if exists form_update_requests_staff on public.form_update_requests;
create policy form_update_requests_staff on public.form_update_requests for all
  using (exists (select 1 from members where auth_id = (select auth.uid()) and role in ('admin', 'captain', 'coach', 'head_coach')))
  with check (exists (select 1 from members where auth_id = (select auth.uid()) and role in ('admin', 'captain', 'coach', 'head_coach')));
alter table public.membership_forms add column if not exists superseded_at timestamptz;
alter table public.membership_forms add column if not exists updated_via_request boolean default false;

-- the form opened from the link: what's on file now (no login needed, the token is the key)
create or replace function public.kc_form_update_get(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record; m record; s record; f record;
begin
  select * into r from form_update_requests where token = p_token;
  if r is null then return jsonb_build_object('error', 'This link is not valid.'); end if;
  if r.used_at is not null then return jsonb_build_object('error', 'This form has already been updated -- thank you.'); end if;
  if r.expires_at < now() then return jsonb_build_object('error', 'This link has expired -- please ask the club for a new one.'); end if;
  select * into m from members where id = r.member_id;
  select * into s from students where id = coalesce(r.student_id, (select id from students where member_id = r.member_id limit 1));
  select * into f from membership_forms where member_id = r.member_id and superseded_at is null order by submitted_at desc nulls last limit 1;
  return jsonb_build_object('form_type', r.form_type, 'member', to_jsonb(m) - 'auth_id' - 'role', 'student', to_jsonb(s), 'form', coalesce(to_jsonb(f), '{}'::jsonb));
end $$;
grant execute on function public.kc_form_update_get(text) to anon, authenticated;

-- save the corrected, re-signed form onto the existing record
create or replace function public.kc_form_update_submit(p_token text, p_member jsonb, p_student jsonb, p_form jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_sid uuid; v_form jsonb; v_old jsonb;
begin
  select * into r from form_update_requests where token = p_token for update;
  if r is null or r.used_at is not null or r.expires_at < now() then raise exception 'This link is no longer valid.'; end if;
  update members set
    first_name = coalesce(nullif(trim(p_member->>'first_name'), ''), first_name),
    last_name = coalesce(nullif(trim(p_member->>'last_name'), ''), last_name),
    email = coalesce(nullif(trim(p_member->>'email'), ''), email),
    phone = coalesce(nullif(trim(p_member->>'phone'), ''), phone),
    date_of_birth = coalesce(nullif(p_member->>'date_of_birth', '')::date, date_of_birth),
    address_line1 = coalesce(nullif(trim(p_member->>'address_line1'), ''), address_line1)
  where id = r.member_id;
  v_sid := coalesce(r.student_id, (select id from students where member_id = r.member_id limit 1));
  update students set
    guardian_name = coalesce(nullif(trim(p_student->>'guardian_name'), ''), guardian_name),
    guardian_phone = coalesce(nullif(trim(p_student->>'guardian_phone'), ''), guardian_phone),
    media_restriction = coalesce(nullif(p_student->>'media_restriction', ''), media_restriction),
    medical_conditions = case when p_student ? 'medical_conditions' then nullif(p_student->>'medical_conditions', '') else medical_conditions end,
    school = coalesce(nullif(trim(p_student->>'school'), ''), school)
  where id = v_sid;
  -- start from the form on file (keeps every column filled), then the parent's answers on top
  select to_jsonb(f) into v_old from membership_forms f where f.member_id = r.member_id and f.superseded_at is null order by f.submitted_at desc nulls last limit 1;
  update membership_forms set superseded_at = now() where member_id = r.member_id and superseded_at is null;
  v_form := coalesce(v_old, '{}'::jsonb) - 'document_url' || p_form || jsonb_build_object('created_at', now(), 'superseded_at', null, 'id', gen_random_uuid(), 'member_id', r.member_id, 'form_type', r.form_type,
                                         'submitted_at', now(), 'updated_via_request', true);
  insert into membership_forms select * from jsonb_populate_record(null::membership_forms, v_form);
  update form_update_requests set used_at = now() where token = p_token;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.kc_form_update_submit(text, jsonb, jsonb, jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
select 'ok' as done;
