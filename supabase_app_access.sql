-- 📱 Athlete app for anyone (not just KR / KRBA / PTs): a per-student switch
-- (Students -> their record -> Edit record -> Group membership -> 📱 Athlete app)
alter table public.students add column if not exists app_access boolean not null default false;
notify pgrst, 'reload schema';

-- Caitlin Reid: athlete app on
update students s set app_access = true
from members m
where m.id = s.member_id and m.first_name ilike 'caitlin' and m.last_name ilike 'reid'
returning s.id, m.first_name, m.last_name, m.email, s.discipline, s.app_access, (m.auth_id is not null) as has_login;
