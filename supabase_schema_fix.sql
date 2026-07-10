-- ============================================
-- FIXES: Correct houses + point types + classes
-- Run this AFTER the previous schema files
-- ============================================

-- Remove placeholder houses, insert real ones
DELETE FROM houses;

INSERT INTO houses (name, colour, points, wins, draws, losses, goals_for, goals_against) VALUES
  ('Dragon House', '#E24B4A', 381, 0, 0, 0, 0, 0),
  ('Super House',  '#378ADD', 312, 0, 0, 0, 0, 0),
  ('Ice House',    '#1D9E75', 0,   0, 0, 0, 0, 0),
  ('Jet House',    '#EF9F27', 348, 0, 0, 0, 0, 0);

-- Fix point types to match actual system
UPDATE settings SET value = '[
  {"label":"Attended","points":2},
  {"label":"Training in Full Kit","points":5},
  {"label":"Technical Effort","points":5},
  {"label":"Physical Effort","points":5},
  {"label":"Q&A","points":5},
  {"label":"Extra Focused","points":5},
  {"label":"Pad Work","points":5},
  {"label":"Partner Work","points":5},
  {"label":"Bag Work","points":5},
  {"label":"Shield Work","points":5},
  {"label":"Leadership - Good Work","points":5},
  {"label":"Test Fight Win","points":10},
  {"label":"Class Champ","points":10},
  {"label":"High grade high effort","points":10},
  {"label":"High grade low effort","points":-10},
  {"label":"Compete","points":10},
  {"label":"Compete-place","points":10},
  {"label":"Compete-win","points":10}
]' WHERE key = 'point_types';

-- Fix PKA belt grades (actual grades in use)
UPDATE settings SET value = '["Ungraded","Red","Yellow","Orange","Green","Blue","Purple","Brown","Black","Yellow Tag","Orange Tag","Green Tag","Blue Tag","Purple Tag","Brown Tag"]'
WHERE key = 'pka_junior_belts';

UPDATE settings SET value = '["Ungraded","Red","Yellow","Orange","Green","Blue","Purple","Brown","Black","Yellow Tag","Orange Tag","Green Tag","Blue Tag","Purple Tag","Brown Tag"]'
WHERE key = 'pka_senior_belts';

-- Fix KRBA levels
UPDATE settings SET value = '["Beginner","Novice","Intermediate","Advanced","Elite","Professional"]'
WHERE key = 'krba_levels';

-- Clear placeholder classes, insert real ones
DELETE FROM classes;

INSERT INTO classes (name, discipline, day_of_week, start_time, end_time, age_category, instructor) VALUES
  ('Class Register',   'PKA',  'Mon/Fri',     '17:00', '18:00', 'All',    ''),
  ('PTs Register',     'PKA',  'Mon/Fri',     '18:00', '19:00', 'Squad',  ''),
  ('KR Register',      'PKA',  'Mon/Fri',     '19:00', '20:00', 'Squad',  ''),
  ('Leader Register',  'PKA',  'Mon/Fri',     '19:00', '20:00', 'Leader', ''),
  ('KRBA Register',    'KRBA', 'Tue/Thu',     '18:00', '19:30', 'All',    ''),
  ('Derby Moore Class','PKA',  'Derby Moore', '13:00', '14:00', 'All',    ''),
  ('Derby Moore KR',   'PKA',  'Derby Moore', '14:00', '15:00', 'Squad',  ''),
  ('Moorways',         'PKA',  'Moorways',    '13:30', '15:00', 'All',    '');

-- ============================================
-- Membership forms extended data table
-- ============================================
CREATE TABLE IF NOT EXISTS membership_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES members(id) ON DELETE CASCADE,
  form_type text NOT NULL CHECK (form_type IN ('pka_child','pka_adult','krba')),
  sponsor_name text,           -- PKA child: sponsor/referral
  parents_carers text,         -- PKA child
  school text,                 -- PKA child
  school_year text,            -- PKA child
  other_activities text,
  medical text,
  hear_about text,
  promo_code text,
  goal_description text,
  fitness_level text,          -- PKA adult
  goal_health integer,
  goal_appearance integer,
  goal_performance integer,
  goal_selfdefence integer,
  additional_needs text,       -- KRBA
  medical_concerns text,       -- KRBA
  medication text,             -- KRBA
  previous_club text,          -- KRBA
  other_contact text,
  submitted_at timestamptz DEFAULT now()
);

ALTER TABLE membership_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "forms_insert" ON membership_forms FOR INSERT WITH CHECK (true);
CREATE POLICY "forms_read"   ON membership_forms FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================
-- TPT Analysis tables
-- ============================================
CREATE TABLE IF NOT EXISTS tpt_boxing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  first_name text, last_name text,
  assessed_by uuid REFERENCES members(id) ON DELETE SET NULL,
  assessed_at timestamptz DEFAULT now(),
  -- Technical (10 fields)
  shapes integer, punch_quality integer, footwork integer,
  defence integer, counters integer, attack integer,
  combinations integer, change_of_tempo integer, use_of_phases integer,
  distance integer, flow integer, self_expression integer,
  -- Physical (18 fields)
  foot_speed integer, limb_speed integer, combination_speed integer,
  reaction integer, punching_power integer,
  strength_upper integer, strength_lower integer, stability_core integer,
  agility integer, stop_n_go integer,
  stamina_aerobic integer, stamina_anaerobic integer,
  suppleness_upper integer, suppleness_lower integer,
  recovery integer, health integer,
  -- Mental (8 fields)
  read_opponent integer, tempo_rhythm integer,
  tactical_intelligence integer, ring_awareness integer,
  know_strengths_weaknesses integer, heart_grit integer,
  concentration integer, timing integer,
  notes text
);

ALTER TABLE tpt_boxing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tpt_boxing_read"  ON tpt_boxing FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "tpt_boxing_write" ON tpt_boxing FOR ALL USING (
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND role IN ('admin','captain'))
);

-- ============================================
-- Kickboxing TPT (Kode Red Analysis) table
-- ============================================
CREATE TABLE IF NOT EXISTS tpt_kickboxing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  first_name text, last_name text, house text,
  assessed_by uuid REFERENCES members(id) ON DELETE SET NULL,
  assessed_at timestamptz DEFAULT now(),
  -- Body measurements
  weight_kg numeric(5,2), height_cm numeric(5,1),
  arm_span_cm numeric(5,1), leg_reach_cm numeric(5,1),
  -- Technique counts
  straight_punches integer,
  round_kicks_floor_left integer, round_kicks_floor_right integer,
  round_kicks_air_left integer,   round_kicks_air_right integer,
  -- Cardiovascular
  resting_hr integer, session_peak_hr integer,
  run_20min_distance numeric(6,2), run_20min_peak_hr integer,
  bleep_test_level numeric(4,1),  bleep_test_peak_hr integer,
  run_200m_1 numeric(6,2), run_200m_2 numeric(6,2),
  run_200m_3 numeric(6,2), run_200m_4 numeric(6,2),
  sprint_peak_hr integer,
  run_1600m numeric(6,2), run_4800m numeric(6,2),
  fixed_load_circuit_time numeric(6,2),
  -- Strength
  dips integer, push_ups integer, pull_ups integer,
  full_sit_up integer, squats integer,
  -- Endurance holds (seconds)
  flat_plank integer,
  side_plank_right integer, side_plank_left integer,
  kick_hold_front_left integer, kick_hold_front_right integer,
  kick_hold_side_left integer,  kick_hold_side_right integer,
  -- Grip / pinch (kg)
  pinch_left numeric(4,1), pinch_right numeric(4,1),
  grip_left numeric(4,1),  grip_right numeric(4,1),
  -- Flexibility (cm or degrees)
  hamstring_stretch numeric(5,1),
  box_splits numeric(5,1),
  front_splits_left numeric(5,1), front_splits_right numeric(5,1),
  shoulder_range_right numeric(5,1), shoulder_range_left numeric(5,1),
  -- Power
  vertical_jump numeric(5,1), long_jump numeric(5,1),
  notes text
);

ALTER TABLE tpt_kickboxing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tpt_kb_read"  ON tpt_kickboxing FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "tpt_kb_write" ON tpt_kickboxing FOR ALL USING (
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND role IN ('admin','captain'))
);

-- ============================================
-- Fit II Fight training sessions table
-- ============================================
CREATE TABLE IF NOT EXISTS fit2fight_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  first_name text, last_name text,
  logged_by uuid REFERENCES members(id) ON DELETE SET NULL,
  session_date date DEFAULT CURRENT_DATE,
  -- Body stats
  weight_before numeric(5,2), weight_after numeric(5,2),
  height_cm numeric(5,1), reach_cm numeric(5,1),
  -- Module flags & data (stored as jsonb for flexibility)
  running jsonb,        -- {type, notes, sets: [], avg_bpm, peak_bpm}
  watt_bike jsonb,      -- {type, sets: [], total_distance, max_wattage, avg_wattage, avg_bpm, peak_bpm}
  bodyweight jsonb,     -- {type, notes, sets: []}
  stretch_flows jsonb,  -- [flow1, flow2, flow3]
  test jsonb,           -- {type, notes, result}
  techniques jsonb,     -- {type, notes, sets: []}
  eye_training text,
  one_percenters jsonb, -- {type, notes}
  heart_rate jsonb,     -- {type, notes, avg_bpm, peak_bpm}
  trained_further boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fit2fight_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "f2f_read"   ON fit2fight_sessions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "f2f_insert" ON fit2fight_sessions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "f2f_update" ON fit2fight_sessions FOR UPDATE USING (
  logged_by = (SELECT id FROM members WHERE auth_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND role IN ('admin','captain'))
);

-- ============================================
-- Athlete profiles table
-- ============================================
CREATE TABLE IF NOT EXISTS athlete_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  -- Competition info
  age_division_kickboxing text,
  age_division_boxing text,
  weight_division text,
  kode_red_debut date,
  -- Profile content
  top_achievements text,
  favourite_technique text,
  training_music text,
  recent_results jsonb,       -- array of result strings
  social_media text,
  sponsor_links text,
  -- Media
  profile_photo_url text,
  media_files jsonb,          -- [{name, url, type, uploaded_at}]
  -- Visibility
  show_on_website boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE athlete_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read"   ON athlete_profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "profiles_write"  ON athlete_profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND role IN ('admin','captain'))
  OR EXISTS (
    SELECT 1 FROM students s JOIN members m ON s.member_id = m.id
    WHERE s.id = athlete_profiles.student_id AND m.auth_id = auth.uid()
  )
);

-- Add missing columns to membership_forms
ALTER TABLE membership_forms ADD COLUMN IF NOT EXISTS sponsor_name text;
ALTER TABLE membership_forms ADD COLUMN IF NOT EXISTS school text;
ALTER TABLE membership_forms ADD COLUMN IF NOT EXISTS year text;
ALTER TABLE membership_forms ADD COLUMN IF NOT EXISTS other_activities text;
ALTER TABLE membership_forms ADD COLUMN IF NOT EXISTS hear_about text;
ALTER TABLE membership_forms ADD COLUMN IF NOT EXISTS promo_code text;
ALTER TABLE membership_forms ADD COLUMN IF NOT EXISTS goals jsonb;
ALTER TABLE membership_forms ADD COLUMN IF NOT EXISTS goal_notes text;
ALTER TABLE membership_forms ADD COLUMN IF NOT EXISTS fitness_level text;
ALTER TABLE membership_forms ADD COLUMN IF NOT EXISTS emergency_contact_name text;
ALTER TABLE membership_forms ADD COLUMN IF NOT EXISTS emergency_contact_phone text;
ALTER TABLE membership_forms ADD COLUMN IF NOT EXISTS additional_needs text;
ALTER TABLE membership_forms ADD COLUMN IF NOT EXISTS previous_club text;
ALTER TABLE membership_forms ADD COLUMN IF NOT EXISTS waiver_agreed boolean DEFAULT false;
ALTER TABLE membership_forms ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

-- Add stopped status to members (status has a check constraint, so it must be updated explicitly)
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_status_check;
ALTER TABLE members ADD CONSTRAINT members_status_check CHECK (status IN ('active','pending','inactive','stopped'));
-- Add trained_for column to students
ALTER TABLE students ADD COLUMN IF NOT EXISTS school text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS medication text;

-- Add pdp_shared column for athlete-visible PDP notes
ALTER TABLE athlete_profiles ADD COLUMN IF NOT EXISTS pdp_shared jsonb DEFAULT '{}'::jsonb;

-- Attendance table for check-in
CREATE TABLE IF NOT EXISTS attendance (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid REFERENCES students(id),
  attended_at timestamptz DEFAULT now(),
  attendance_type text DEFAULT 'attended', -- attended | full_kit | weight
  created_at timestamptz DEFAULT now()
);
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attendance_read" ON attendance;
DROP POLICY IF EXISTS "attendance_insert" ON attendance;
CREATE POLICY "attendance_read"   ON attendance FOR SELECT USING (true);
CREATE POLICY "attendance_insert" ON attendance FOR INSERT WITH CHECK (true);
