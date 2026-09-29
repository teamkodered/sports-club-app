-- PDP <-> question links. One extra column on athlete_profiles; PDP notes
-- themselves are unchanged. Shape: { "<pdp section key>::<item text>": { pillar, q, item } }
alter table public.athlete_profiles add column if not exists pdp_links jsonb not null default '{}'::jsonb;
