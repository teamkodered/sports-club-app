-- 🏆 AWARDS: nominations by coaches, athlete votes (Fighters fighter), admin picks winners,
-- plus the past years' register for admin records. Admin-only results (students don't see them).

create or replace function public.kc_awards_coach()   -- any coach / staff login
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where auth_id = auth.uid() and role in ('admin', 'captain', 'coach', 'leader', 'head_coach'))
$$;
create or replace function public.kc_awards_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where auth_id = auth.uid() and role = 'admin')
$$;

create table if not exists public.awards_categories (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  grp text not null,                 -- 'Mon 18:00 Derby Moore', 'KR', 'KRBA', 'Club', 'Houses'
  grp_kind text not null default 'class',   -- class | squad | club | house
  class_id uuid,                     -- class awards: the class
  squad text,                        -- 'KR' | 'KRBA' for squad awards
  name text not null,                -- 'Best newcomer'...
  vote boolean not null default false,       -- athletes vote (Fighters fighter)
  sort int not null default 0,
  winner_name text, winner_student_id uuid, winner_member_id uuid,
  created_at timestamptz default now()
);
create table if not exists public.awards_nominations (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.awards_categories(id) on delete cascade,
  student_id uuid, member_id uuid, nominee_name text not null,
  coach_member_id uuid not null, coach_name text, reason text,
  created_at timestamptz default now(),
  unique (category_id, coach_member_id)      -- one nominee per coach per category
);
create table if not exists public.awards_votes (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.awards_categories(id) on delete cascade,
  voter_student_id uuid not null, student_id uuid not null, nominee_name text,
  created_at timestamptz default now(),
  unique (category_id, voter_student_id)     -- one vote each
);
create table if not exists public.awards_history (
  id uuid primary key default gen_random_uuid(),
  year int not null, grp text, category text, winner text
);

alter table public.awards_categories enable row level security;
alter table public.awards_nominations enable row level security;
alter table public.awards_votes enable row level security;
alter table public.awards_history enable row level security;

drop policy if exists awards_cat_read on public.awards_categories;
create policy awards_cat_read on public.awards_categories for select using (auth.uid() is not null);
drop policy if exists awards_cat_admin on public.awards_categories;
create policy awards_cat_admin on public.awards_categories for all using ((select public.kc_awards_admin())) with check ((select public.kc_awards_admin()));

drop policy if exists awards_nom_admin on public.awards_nominations;
create policy awards_nom_admin on public.awards_nominations for all using ((select public.kc_awards_admin())) with check ((select public.kc_awards_admin()));
drop policy if exists awards_nom_own on public.awards_nominations;
create policy awards_nom_own on public.awards_nominations for all
  using ((select public.kc_awards_coach()) and coach_member_id in (select id from members where auth_id = (select auth.uid())))
  with check ((select public.kc_awards_coach()) and coach_member_id in (select id from members where auth_id = (select auth.uid())));

drop policy if exists awards_vote_admin on public.awards_votes;
create policy awards_vote_admin on public.awards_votes for all using ((select public.kc_awards_admin())) with check ((select public.kc_awards_admin()));
drop policy if exists awards_vote_own on public.awards_votes;
create policy awards_vote_own on public.awards_votes for all
  using (voter_student_id in (select s.id from students s join members m on m.id = s.member_id where m.auth_id = (select auth.uid())))
  with check (voter_student_id in (select s.id from students s join members m on m.id = s.member_id where m.auth_id = (select auth.uid())));

drop policy if exists awards_hist_admin on public.awards_history;
create policy awards_hist_admin on public.awards_history for all using ((select public.kc_awards_admin())) with check ((select public.kc_awards_admin()));

-- past years (from Awards_register.xlsx) -- admin records only; loaded once
insert into public.awards_history (year, grp, category, winner)
select * from (values
(2025, 'Monday DM', 'Best Newcomer', 'Malika Ebraheem'),
(2025, 'Monday DM', 'Most Improved', 'Amaya Whitehurst'),
(2025, 'Monday DM', 'Most Committed', 'Ameer Salih'),
(2025, 'Monday DM', 'Student of the Year', 'Leonardo Pang'),
(2025, 'Tuesday MW', 'Best Newcomer', 'Amelia Beardsall'),
(2025, 'Tuesday MW', 'Most Improved', 'Alan Ahmed'),
(2025, 'Tuesday MW', 'Most Committed', 'Hayden Jones'),
(2025, 'Tuesday MW', 'Student of the Year', 'Hadi Naqvi'),
(2025, 'Monday/Friday KR 5pm', 'Best Newcomer', 'Zayn Ali-Smith'),
(2025, 'Monday/Friday KR 5pm', 'Most Improved', 'Arjay Saini'),
(2025, 'Monday/Friday KR 5pm', 'Most Committed', 'Harveer Tamber'),
(2025, 'Monday/Friday KR 5pm', 'Student of the Year', 'Arlo Osborne'),
(2025, 'Monday/Friday KR 6pm', 'Best Newcomer', 'Ellis Hudson'),
(2025, 'Monday/Friday KR 6pm', 'Most Improved', 'Felix Cooke'),
(2025, 'Monday/Friday KR 6pm', 'Most Committed', 'Leo Fitzpatrick'),
(2025, 'Monday/Friday KR 6pm', 'Student of the Year', 'Millan Rai'),
(2025, 'Monday/Friday KR 7pm', 'Best Newcomer', 'Martin Thirlwell'),
(2025, 'Monday/Friday KR 7pm', 'Most Improved', 'Leonidas Aravidis'),
(2025, 'Monday/Friday KR 7pm', 'Most Committed', 'Joshua Bowers'),
(2025, 'Monday/Friday KR 7pm', 'Student of the Year', 'Charlie Dyer'),
(2024, 'Tuesday/Thursday KR 5pm', 'Best Newcomer', 'Emily'),
(2025, 'Tuesday/Thursday KR 5pm', 'Best Newcomer', 'Izzie Scarff'),
(2024, 'Tuesday/Thursday KR 5pm', 'Most Improved', 'Emmelia'),
(2025, 'Tuesday/Thursday KR 5pm', 'Most Improved', 'Emily Permineva'),
(2024, 'Tuesday/Thursday KR 5pm', 'Most Committed', 'Marley'),
(2025, 'Tuesday/Thursday KR 5pm', 'Most Committed', 'Millie Kim'),
(2024, 'Tuesday/Thursday KR 5pm', 'Student of the Year', 'Harry'),
(2025, 'Tuesday/Thursday KR 5pm', 'Student of the Year', 'Anthony Jablonski Lacey'),
(2025, 'Tuesday/Thursday KR 6pm', 'Best Newcomer', 'Eissa Khan'),
(2025, 'Tuesday/Thursday KR 6pm', 'Most Improved', 'Ella Leape'),
(2025, 'Tuesday/Thursday KR 6pm', 'Most Committed', 'Willow Bullimore'),
(2025, 'Tuesday/Thursday KR 6pm', 'Student of the Year', 'Yannis Mirza'),
(2025, 'Tuesday/Thursday KR 7pm', 'Best Newcomer', 'Leon Brathwaite'),
(2025, 'Tuesday/Thursday KR 7pm', 'Most Improved', 'Danish Kuganesan'),
(2025, 'Tuesday/Thursday KR 7pm', 'Most Committed', 'Olivia Porter'),
(2025, 'Tuesday/Thursday KR 7pm', 'Student of the Year', 'Jaydon Gordon'),
(2025, 'Ladies only Sun 11am', 'Best Newcomer', 'Shelby Smith'),
(2025, 'Ladies only Sun 11am', 'Most Improved', 'Yasmeen Youssef'),
(2025, 'Ladies only Sun 11am', 'Most Committed', 'Ruth Newman'),
(2025, 'Ladies only Sun 11am', 'Student of the Year', 'Jiajia Chen'),
(2024, 'KR', 'Best Newcomer', 'Charlie'),
(2025, 'KR', 'Best Newcomer', 'Noah Matoso'),
(2024, 'KR', 'Most Improved', 'Kynsley'),
(2025, 'KR', 'Most Improved', 'Caylen Lacey'),
(2024, 'KR', 'Most Committed', 'Charlie'),
(2025, 'KR', 'Most Committed', 'Kynsley Roberts-Downing'),
(2024, 'KR', 'Most Determined', 'Leo'),
(2025, 'KR', 'Most Determined', 'Leo Sellers-Brown'),
(2025, 'KR', 'Fighters Fighter-google forms', 'Charlie Kacie'),
(2024, 'KR', 'Coaches Fighter', 'Nilay'),
(2025, 'KR', 'Coaches Fighter', 'Charlie'),
(2024, 'KRBA', 'Best Newcomer', 'Sam'),
(2024, 'KRBA', 'Most Improved', 'Andy'),
(2025, 'KRBA', 'Most Improved', 'Jamaal Iqbal'),
(2024, 'KRBA', 'Most Committed', 'Jamal'),
(2025, 'KRBA', 'Most Committed', 'Andreas Kalopedis'),
(2025, 'KRBA', 'Most Determined', 'Ayaan Iqbal'),
(2025, 'KRBA', 'Fighters Fighter-google forms', 'Simi Mann'),
(2025, 'KRBA', 'Coaches Fighter', 'Sam Mahaffey'),
(2024, 'KRBA', 'Mentions', 'Orin,Dominic,Anthony, Louis, Chantelle'),
(2025, 'KRBA', 'Mentions', 'DJ, CHAntelle, Dainen,'),
(2025, 'Dragon House', 'Dragon House #1', 'Caylen Lacey'),
(2025, 'Dragon House', 'Dragon House #2', 'Alan Mohammed Rychnov'),
(2025, 'Dragon House', 'Dragon House #3', 'Destiny Foote'),
(2025, 'Jet House', 'Jet House #1', 'Mia Rychnov'),
(2025, 'Jet House', 'Jet House #2', 'Prudence Roberts-downing'),
(2025, 'Jet House', 'Jet House #3', 'Kacie Lacey'),
(2025, 'Super House', 'Super House #1', 'Charlie Dyer'),
(2025, 'Super House', 'Super House #2', 'Noah Matoso'),
(2025, 'Super House', 'Super House #3', 'Harry Brailsford'),
(2025, 'Ice House', 'Ice House #1', 'Leo Sellers-Brown'),
(2025, 'Ice House', 'Ice House #2', 'Keira Kim'),
(2025, 'Ice House', 'Ice House #3', 'Anthony Jablonski'),
(2025, 'Ice House', 'House Winners', 'Super House'),
(2025, 'Ice House', 'Student House Winner', 'Charlie Dyer'),
(2025, 'Ice House', 'Coaches Coach', 'Dan Hudson'),
(2025, 'Ice House', 'Junior Leader', 'Kynsley Roberts-Downing'),
(2025, 'Ice House', 'Tinys Leader', 'Kacie Lacey'),
(2025, 'Ice House', 'Special Warrior Awards', 'Orin Tinsley'),
(2017, 'PKA KR Centre', 'Best Newcomer', 'Hannah Jones'),
(2017, 'PKA KR Centre', 'Best Newcomer', 'Tracey Dolman'),
(2019, 'PKA KR Centre', 'Best Newcomer', 'Logan Brady'),
(2017, 'PKA KR Centre', 'Best Newcomer Junior', 'Nilay Saini'),
(2017, 'PKA KR Centre', 'Best Newcomer Junior', 'Adrian Tylinski'),
(2018, 'PKA KR Centre', 'Best Newcomer Junior', 'Emma Browett'),
(2019, 'PKA KR Centre', 'Best Newcomer Junior', 'Malachai Williams'),
(2022, 'PKA KR Centre', 'Best Newcomer Junior', 'Teddy'),
(2022, 'PKA KR Centre', 'Best Newcomer Junior', 'Aziah'),
(2023, 'PKA KR Centre', 'Best Newcomer Junior', 'Noah'),
(2017, 'PKA KR Centre', 'Best Newcomer Tiny', 'Katalina Kulesvicius'),
(2017, 'PKA KR Centre', 'Best Newcomer Tiny', 'Jack Riley'),
(2017, 'PKA KR Centre', 'Most Improved', 'Hannah Jones'),
(2019, 'PKA KR Centre', 'Most Improved', 'Paul Westwood'),
(2017, 'PKA KR Centre', 'Most Improved Junior', 'Nilay Saini'),
(2018, 'PKA KR Centre', 'Most Improved Junior', 'Will Haywood'),
(2019, 'PKA KR Centre', 'Most Improved Junior', 'Taylor Griffiths'),
(2022, 'PKA KR Centre', 'Most Improved Junior', 'Olivia'),
(2022, 'PKA KR Centre', 'Most Improved Junior', 'Caitlin'),
(2022, 'PKA KR Centre', 'Most Improved Junior', 'Emelia'),
(2022, 'PKA KR Centre', 'Most Improved Junior', 'Harry'),
(2023, 'PKA KR Centre', 'Most Improved Junior', 'Emelia'),
(2023, 'PKA KR Centre', 'Most Improved Junior', 'Harry'),
(2017, 'PKA KR Centre', 'Most Improved Tiny', 'Karum Singh'),
(2023, 'PKA KR Centre', 'Most Improved Tiny', 'Marley'),
(2017, 'PKA KR Centre', 'Most Commited', 'Sarah Gebbie'),
(2018, 'PKA KR Centre', 'Most Commited', 'Charlie Partridge'),
(2019, 'PKA KR Centre', 'Most Commited', 'Raechel Bate'),
(2017, 'PKA KR Centre', 'Most Commited Junior', 'Jack Long'),
(2019, 'PKA KR Centre', 'Most Commited Junior', 'Kai Beckford'),
(2022, 'PKA KR Centre', 'Most Commited Junior', 'Mason Dhinsa'),
(2022, 'PKA KR Centre', 'Most Commited Junior', 'Keira'),
(2022, 'PKA KR Centre', 'Most Commited Junior', 'Adrian'),
(2022, 'PKA KR Centre', 'Most Commited Junior', 'Oskar'),
(2023, 'PKA KR Centre', 'Most Commited Junior', 'Caitlin'),
(2023, 'PKA KR Centre', 'Most Commited Junior', 'Mason B'),
(2017, 'PKA KR Centre', 'Most Commited Tiny', 'Katalina Kulesvicius'),
(2019, 'PKA KR Centre', 'Most Commited Tiny', 'Aleks Gabzdyl'),
(2019, 'PKA KR Centre', 'Most Commited Tiny', 'Cole Keeling'),
(2017, 'PKA KR Centre', 'Student of the Year', 'Tim Di Betta'),
(2019, 'PKA KR Centre', 'Student of the Year', 'Sarah Gebbie'),
(2017, 'PKA KR Centre', 'Student of the Year Junior', 'Kavarni Christian'),
(2018, 'PKA KR Centre', 'Student of the Year Junior', 'Myah Saini'),
(2019, 'PKA KR Centre', 'Student of the Year Junior', 'Sean Burke'),
(2022, 'PKA KR Centre', 'Student of the Year Junior', 'Kiera Kim'),
(2022, 'PKA KR Centre', 'Student of the Year Junior', 'Oskar'),
(2022, 'PKA KR Centre', 'Student of the Year Junior', 'Mason'),
(2023, 'PKA KR Centre', 'Student of the Year Junior', 'Mason D'),
(2017, 'PKA KR Centre', 'Student of the Year Tiny', 'Enaya Henry'),
(2019, 'PKA KR Centre', 'Student of the Year Tiny', 'Darcie Haywood'),
(2018, 'PKA Each Satalites', 'Student of the Year', 'Chris Lacey'),
(2018, 'PKA Each Satalites', 'Student of the Year', 'Domingkas Ignatjeva'),
(2019, 'PKA Each Satalites', 'Most Improved', 'Priya Sanghera'),
(2019, 'PKA Each Satalites', 'Most Commited', 'Rose Slater'),
(2017, 'KR', 'Best Newcomer', 'Joginder Singh'),
(2018, 'KR', 'Best Newcomer', 'Kynsley Roberts-Downing'),
(2019, 'KR', 'Best Newcomer', 'Charlie Partridge'),
(2019, 'KR', 'Best Newcomer', 'Logan Brady'),
(2022, 'KR', 'Best Newcomer', 'Jak'),
(2022, 'KR', 'Best Newcomer', 'Leo'),
(2022, 'KR', 'Best Newcomer', 'Kacie'),
(2023, 'KR', 'Best Newcomer', 'Keira'),
(2017, 'KR', 'Most Improved', 'Marcin Mazur'),
(2018, 'KR', 'Most Improved', 'Kavarni Christian'),
(2019, 'KR', 'Most Improved', 'Kynsley Roberts-Downing'),
(2022, 'KR', 'Most Improved', 'Kacie'),
(2022, 'KR', 'Most Improved', 'Fin'),
(2022, 'KR', 'Most Improved', 'Hadi'),
(2023, 'KR', 'Most Improved', 'Kynsley'),
(2017, 'KR', 'Most Commited', 'Dainen Oldham'),
(2018, 'KR', 'Most Commited', 'Dainen Oldham'),
(2018, 'KR', 'Most Commited', 'Kavarni Christian'),
(2019, 'KR', 'Most Commited', 'Emma Browett'),
(2022, 'KR', 'Most Commited', 'Fin'),
(2022, 'KR', 'Most Commited', 'Emma'),
(2022, 'KR', 'Most Commited', 'Mia'),
(2022, 'KR', 'Most Commited', 'Nilay'),
(2023, 'KR', 'Most Commited', 'Nilay'),
(2019, 'KR', 'Most Determined', 'Nilay Saini'),
(2022, 'KR', 'Most Determined', 'Leo'),
(2022, 'KR', 'Most Determined', 'Jak'),
(2022, 'KR', 'Most Determined', 'Kacie'),
(2017, 'KR', 'Coaches Fighter', 'Daryl Oldham'),
(2018, 'KR', 'Coaches Fighter', 'Dainen Oldham'),
(2019, 'KR', 'Coaches Fighter', 'Le''rayah Wilkes'),
(2022, 'KR', 'Coaches Fighter', 'Mason'),
(2022, 'KR', 'Coaches Fighter', 'Emma'),
(2022, 'KR', 'Coaches Fighter', 'Kacie'),
(2022, 'KR', 'Coaches Fighter', 'Leo'),
(2019, 'KR', 'Fighters Fighter-google forms', 'Kavarni Christian'),
(2019, 'KR', 'Fighters Fighter-google forms', 'Sean Burke'),
(2022, 'KRBA', 'Best Newcomer', 'Zane'),
(2023, 'KRBA', 'Best Newcomer', 'Reggie'),
(2022, 'KRBA', 'Most Improved', 'Louisn Mychajlow'),
(2023, 'KRBA', 'Most Improved', 'Louis'),
(2022, 'KRBA', 'Most Commited', 'Louis Mychajlow'),
(2023, 'KRBA', 'Most Commited', 'Louis'),
(2022, 'KRBA', 'Most Determined', 'Chantelle Reid'),
(2023, 'KRBA', 'Most Determined', 'Chantelle'),
(2022, 'KRBA', 'Coaches Fighter', 'DJ Reid'),
(2018, 'Fighters Fighter-google forms', 'Coches Coach', 'Shaun Peachey'),
(2019, 'Fighters Fighter-google forms', 'Coches Coach', 'Patrycja Gabzdyl'),
(2022, 'Fighters Fighter-google forms', 'Coches Coach', 'Shaun'),
(2019, 'Fighters Fighter-google forms', 'Junior Leader', 'Tom Burke'),
(2022, 'Fighters Fighter-google forms', 'Junior Leader', 'Fabio'),
(2022, 'Fighters Fighter-google forms', 'Junior Leader', 'Taylor'),
(2019, 'Fighters Fighter-google forms', 'Tinys Leader', 'Jack Riley'),
(2022, 'Fighters Fighter-google forms', 'Tinys Leader', 'Fabio'),
(2022, 'Fighters Fighter-google forms', 'Special Warrior Awards', 'Janis'),
(2022, 'Fighters Fighter-google forms', 'Special Warrior Awards', 'George'),
(2022, 'Fighters Fighter-google forms', 'Special Warrior Awards', 'Kyle'),
(2022, 'Fighters Fighter-google forms', 'Special Warrior Awards', 'Orin'),
(2022, 'Fighters Fighter-google forms', 'Special Warrior Awards', 'Nilay'),
(2022, 'Fighters Fighter-google forms', 'Special Warrior Awards', 'Sashin')
) v(year, grp, category, winner)
where not exists (select 1 from public.awards_history);

notify pgrst, 'reload schema';
select (select count(*) from awards_history) as past_awards_loaded;

-- athletes: who they can vote for in a vote category (their squad, not themselves)
create or replace function public.kc_awards_vote_options(p_category uuid)
returns table (student_id uuid, name text) language sql stable security definer set search_path = public as $$
  select s.id, trim(m.first_name || ' ' || m.last_name)
  from awards_categories c
  join students s on (c.squad = 'KR' and s.is_kr) or (c.squad = 'KRBA' and s.discipline = 'KRBA')
  join members m on m.id = s.member_id
  where c.id = p_category and c.vote
    and coalesce(m.status, 'active') = 'active'
    and m.auth_id is distinct from auth.uid()
  order by 2
$$;
grant execute on function public.kc_awards_vote_options(uuid) to authenticated;
