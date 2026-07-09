-- ============================================
-- PKA / KRBA Student Database Schema
-- Run this AFTER the base schema
-- ============================================

-- ============================================
-- Configurable settings (editable in app)
-- ============================================

create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- Default belt levels (editable in app)
insert into settings (key, value) values
('pka_junior_belts', '["White","Yellow","Orange","Green","Blue","Purple","Red","Brown","Black Tag"]'),
('pka_senior_belts', '["White","Yellow","Orange","Green","Blue","Purple","Red","Brown","Black Tag","Black 1st","Black 2nd","Black 3rd"]'),
('krba_levels',      '["Novice","Beginner","Intermediate","Advanced","Elite"]'),
('age_categories',   '[{"label":"Under 8","min":0,"max":7},{"label":"8-11","min":8,"max":11},{"label":"12-15","min":12,"max":15},{"label":"16-17","min":16,"max":17},{"label":"18+","min":18,"max":99}]'),
('point_types',      '[{"label":"Class Champion","points":10},{"label":"Attendance Award","points":5},{"label":"Competition Win","points":20},{"label":"Competition 2nd","points":15},{"label":"Competition 3rd","points":10},{"label":"Grading Pass","points":8},{"label":"Behaviour Award","points":5},{"label":"Most Improved","points":8}]')
on conflict (key) do nothing;

-- ============================================
-- Students (extends members for club-specific data)
-- ============================================

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  student_ref text unique, -- e.g. PKA-001

  -- Discipline
  discipline text not null check (discipline in ('PKA','KRBA','Both')),

  -- Belt / grade
  pka_belt text,
  krba_level text,

  -- Age category (auto-calculated but overridable)
  age_category text,

  -- Competition sub-team (PKA)
  competition_team text, -- e.g. 'Squad A', 'Development', 'Senior Squad'

  -- Weight (for KRBA / boxing)
  weight_kg numeric(5,2),
  weight_category text,

  -- Media restrictions
  media_restriction text default 'Yes' check (media_restriction in ('Yes','No','Limited')),
  media_notes text,

  -- Medical
  medical_conditions text,
  medication text,

  -- Parent / guardian (auto-populated for juniors)
  guardian_name text,
  guardian_relationship text,
  guardian_phone text,
  guardian_email text,

  -- Emergency contact (may differ from guardian)
  ec_name text,
  ec_phone text,
  ec_relationship text,

  -- Points (separate totals)
  house_points integer default 0,
  individual_points integer default 0,

  -- Class champion count
  class_champion_count integer default 0,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- Points log (full audit trail)
-- ============================================

create table if not exists points_log (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  house_id uuid references houses(id) on delete set null,
  awarded_by uuid references members(id) on delete set null,
  point_type text not null,
  points_awarded integer not null,
  point_scope text not null check (point_scope in ('house','individual','both')),
  note text,
  awarded_at timestamptz default now()
);

-- ============================================
-- Classes / sessions
-- ============================================

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,           -- e.g. 'PKA Juniors', 'KRBA Adults'
  discipline text not null check (discipline in ('PKA','KRBA')),
  day_of_week text,             -- e.g. 'Monday'
  start_time time,
  end_time time,
  age_category text,
  instructor text,
  active boolean default true
);

-- ============================================
-- Attendance registers
-- ============================================

create table if not exists registers (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references classes(id) on delete cascade,
  date date not null,
  notes text,
  created_by uuid references members(id),
  created_at timestamptz default now(),
  unique(class_id, date)
);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  register_id uuid references registers(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  present boolean default false,
  late boolean default false,
  note text,
  unique(register_id, student_id)
);

-- ============================================
-- Grading expressions of interest
-- ============================================

create table if not exists grading_expressions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  discipline text,
  current_belt text,
  grading_for text,
  coach_approved boolean default false,
  notes text,
  submitted_at timestamptz default now()
);

-- ============================================
-- Row Level Security
-- ============================================

alter table students            enable row level security;
alter table points_log          enable row level security;
alter table classes             enable row level security;
alter table registers           enable row level security;
alter table attendance          enable row level security;
alter table settings            enable row level security;
alter table grading_expressions enable row level security;

-- Settings: admins write, all authenticated read
create policy "settings_read"  on settings for select using (auth.uid() is not null);
create policy "settings_write" on settings for all using (
  exists (select 1 from members where auth_id = auth.uid() and role in ('admin','captain'))
);

-- Students: authenticated read; admins full write; students read own
create policy "students_read"  on students for select using (auth.uid() is not null);
create policy "students_write" on students for all using (
  exists (select 1 from members where auth_id = auth.uid() and role in ('admin','captain'))
);

-- Points log: authenticated read; admins write
create policy "points_read"  on points_log for select using (auth.uid() is not null);
create policy "points_write" on points_log for all using (
  exists (select 1 from members where auth_id = auth.uid() and role in ('admin','captain'))
);

-- Classes, registers, attendance: authenticated read; admins write
create policy "classes_read"    on classes    for select using (auth.uid() is not null);
create policy "classes_write"   on classes    for all using (exists (select 1 from members where auth_id = auth.uid() and role in ('admin','captain')));
create policy "registers_read"  on registers  for select using (auth.uid() is not null);
create policy "registers_write" on registers  for all using (exists (select 1 from members where auth_id = auth.uid() and role in ('admin','captain')));
create policy "attendance_read" on attendance for select using (auth.uid() is not null);
create policy "attendance_write"on attendance for all using (exists (select 1 from members where auth_id = auth.uid() and role in ('admin','captain')));

-- Grading expressions: students insert own; admins manage all
create policy "grading_read"   on grading_expressions for select using (auth.uid() is not null);
create policy "grading_insert" on grading_expressions for insert with check (true);
create policy "grading_admin"  on grading_expressions for update using (
  exists (select 1 from members where auth_id = auth.uid() and role in ('admin','captain'))
);

-- ============================================
-- Seed classes
-- ============================================

insert into classes (name, discipline, day_of_week, start_time, end_time, age_category, instructor) values
('PKA Tiny Tigers',    'PKA',  'Monday',    '16:00', '16:45', 'Under 8',  'Head Coach'),
('PKA Juniors',        'PKA',  'Monday',    '17:00', '18:00', '8-11',     'Head Coach'),
('PKA Intermediates',  'PKA',  'Monday',    '18:00', '19:00', '12-15',    'Head Coach'),
('PKA Seniors',        'PKA',  'Wednesday', '19:00', '20:00', '16+',      'Head Coach'),
('KRBA Beginners',     'KRBA', 'Tuesday',   '18:00', '19:00', 'All',      'Boxing Coach'),
('KRBA Advanced',      'KRBA', 'Thursday',  '19:00', '20:30', 'All',      'Boxing Coach')
on conflict do nothing;

-- ============================================
-- Additional student fields for KR register
-- ============================================
ALTER TABLE students ADD COLUMN IF NOT EXISTS coach_initials text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS discipline_codes text; -- PF/LC/KL/FC/LK
ALTER TABLE students ADD COLUMN IF NOT EXISTS trained_for_months integer;
ALTER TABLE students ADD COLUMN IF NOT EXISTS gender text check (gender in ('M','F','Other'));
ALTER TABLE students ADD COLUMN IF NOT EXISTS class_schedule text; -- Mon/Fri, Tue/Thu etc
