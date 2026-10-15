-- ════════════════════════════════════════════════════════════════════════
-- LEVEL UP: weekly extra-session bookings (replaces the Google Form)
-- One row per session requested. Requests come in through a public page (no login),
-- via a function that only adds rows; only admins can read / confirm / mark paid.
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.level_up_bookings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,                      -- groups the sessions from one form submission
  week_start date not null,                      -- the Monday of the week booked
  session_label text not null,                   -- e.g. 'Monday 7pm (14+yrs)'
  session_date date,
  first_name text not null, surname text not null, age int, phone text,
  student_id uuid references public.students(id) on delete set null,   -- matched PKA member (null = no match)
  status text not null default 'pending' check (status in ('pending','confirmed','waiting','declined')),
  paid boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists level_up_week_idx on public.level_up_bookings (week_start, session_label, created_at);
alter table public.level_up_bookings enable row level security;
drop policy if exists level_up_admin on public.level_up_bookings;
create policy level_up_admin on public.level_up_bookings for all
  using (public.kc_has_role(array['admin'])) with check (public.kc_has_role(array['admin']));

-- public booking: adds the request (matched to a PKA member by name where possible)
create or replace function public.kc_level_up_request(p_week date, p_first text, p_surname text, p_age int, p_phone text, p_sessions jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rid uuid := gen_random_uuid(); sid uuid; s jsonb; n int := 0;
begin
  if coalesce(trim(p_first), '') = '' or coalesce(trim(p_surname), '') = '' then return jsonb_build_object('error', 'Please enter the student''s first name and surname.'); end if;
  if jsonb_typeof(p_sessions) <> 'array' or jsonb_array_length(p_sessions) = 0 then return jsonb_build_object('error', 'Please choose at least one session.'); end if;
  if jsonb_array_length(p_sessions) > 10 then return jsonb_build_object('error', 'Too many sessions.'); end if;
  select st.id into sid from students st join members m on m.id = st.member_id
   where st.discipline = 'PKA' and lower(trim(m.first_name)) = lower(trim(p_first)) and lower(trim(m.last_name)) = lower(trim(p_surname))
   order by (m.status = 'active') desc limit 1;
  for s in select * from jsonb_array_elements(p_sessions) loop
    insert into level_up_bookings (request_id, week_start, session_label, session_date, first_name, surname, age, phone, student_id)
    values (rid, p_week, left(s ->> 'label', 120), nullif(s ->> 'date', '')::date, left(trim(p_first), 60), left(trim(p_surname), 60), p_age, left(trim(p_phone), 30), sid);
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'sessions', n, 'matched', sid is not null);
end $$;
grant execute on function public.kc_level_up_request(date, text, text, int, text, jsonb) to anon, authenticated;

-- the session list (editable later in the app)
insert into public.settings (key, value) values ('level_up_sessions', '[
  {"label": "Monday 7pm (14+yrs)", "day": 1},
  {"label": "Tuesday 7pm (14+yrs)", "day": 2},
  {"label": "Wednesday 7pm (Jnr & snr mixed)", "day": 3},
  {"label": "Thursday 7pm (14+yrs)", "day": 4},
  {"label": "Thursday 8pm (Sparring 14+years)", "day": 4},
  {"label": "Friday 7pm (14+yrs)", "day": 5},
  {"label": "Sunday 11am (Ladies only 14+yrs)", "day": 7},
  {"label": "Sunday 12pm (Jnr & Snr mixed)", "day": 7}
]'::jsonb) on conflict (key) do nothing;
