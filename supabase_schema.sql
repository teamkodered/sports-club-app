-- ============================================
-- Phoenix Sports Club — Supabase Schema
-- Run this in your Supabase SQL editor
-- ============================================

-- Houses
create table if not exists houses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  colour text default '#888888',
  points integer default 0,
  wins integer default 0,
  draws integer default 0,
  losses integer default 0,
  goals_for integer default 0,
  goals_against integer default 0,
  created_at timestamptz default now()
);

-- Members
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid references auth.users(id) on delete set null,
  member_id text unique,
  first_name text not null,
  last_name text not null,
  email text unique not null,
  phone text,
  date_of_birth date,
  gender text,
  address_line1 text,
  address_line2 text,
  house_id uuid references houses(id) on delete set null,
  role text default 'member' check (role in ('member','captain','admin')),
  status text default 'active' check (status in ('active','pending','inactive')),
  payment_method text,
  joined_date date default current_date,
  ec_name text,
  ec_relationship text,
  ec_phone text,
  ec_email text,
  ec_medical text,
  created_at timestamptz default now()
);

-- Fixtures
create table if not exists fixtures (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  home_house_id uuid references houses(id) on delete cascade,
  away_house_id uuid references houses(id) on delete cascade,
  venue text,
  status text default 'scheduled' check (status in ('scheduled','completed','cancelled','tbc')),
  home_score integer,
  away_score integer,
  created_at timestamptz default now()
);

-- ============================================
-- Seed data — 4 houses
-- ============================================
insert into houses (name, colour, points, wins, draws, losses, goals_for, goals_against) values
  ('Phoenix', '#e24b4a', 28, 9, 1, 2, 31, 14),
  ('Titan',   '#378add', 22, 7, 1, 4, 24, 18),
  ('Viper',   '#1d9e75', 16, 5, 1, 6, 19, 22),
  ('Storm',   '#ef9f27', 10, 3, 1, 8, 12, 32)
on conflict do nothing;

-- ============================================
-- Row Level Security
-- ============================================
alter table houses  enable row level security;
alter table members enable row level security;
alter table fixtures enable row level security;

-- Houses: anyone can read
create policy "houses_public_read" on houses for select using (true);
create policy "houses_admin_write" on houses for all using (
  exists (select 1 from members where auth_id = auth.uid() and role in ('admin','captain'))
);

-- Members: members can read all, edit own; admins can do everything
create policy "members_read" on members for select using (auth.uid() is not null);
create policy "members_insert_own" on members for insert with check (true);
create policy "members_update_own" on members for update using (
  auth_id = auth.uid() or
  exists (select 1 from members where auth_id = auth.uid() and role in ('admin','captain'))
);

-- Fixtures: authenticated users can read; admins can write
create policy "fixtures_read" on fixtures for select using (auth.uid() is not null);
create policy "fixtures_admin_write" on fixtures for all using (
  exists (select 1 from members where auth_id = auth.uid() and role in ('admin','captain'))
);
