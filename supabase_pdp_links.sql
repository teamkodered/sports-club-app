-- PDP <-> question links. One extra column on athlete_profiles; PDP notes
-- themselves are unchanged. Shape: { "<pdp section key>::<item text>": { pillar, q, item } }
alter table public.athlete_profiles add column if not exists pdp_links jsonb not null default '{}'::jsonb;

-- PDP actions done by the athlete (per day): { "<area>::<line text>": ["2026-09-30", ...] }
alter table public.athlete_profiles add column if not exists pdp_done jsonb not null default '{}'::jsonb;
