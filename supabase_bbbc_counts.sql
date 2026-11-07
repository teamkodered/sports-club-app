-- 🥋 BBBC course counts from 'Master Brown and Black Belt preparation Course (Responses)'.
-- Each course (Spring / Autumn of a year) counts once. Saved on the student, so every grading request
-- shows it. The result lists anyone on the sheet who couldn't be matched to a student.
alter table public.students add column if not exists bbbc_courses int;
alter table public.students add column if not exists bbbc_dates text;

create temp table if not exists kc_bbbc_t (first text, last text, courses int, dates text);
truncate kc_bbbc_t;
insert into kc_bbbc_t values
('Adam', 'Humphries', 1, 'Autumn 2026'),
('Ameer', 'Salih', 2, 'Autumn 2025, Autumn 2026'),
('Ashton', 'Fones', 2, 'Autumn 2025, Autumn 2026'),
('Billy', 'Quinn', 2, 'Autumn 2025, Spring 2026'),
('Cali', 'Clarke', 2, 'Spring 2026, Autumn 2026'),
('Caylen', 'Lacey', 1, 'Autumn 2025'),
('Charlie', 'Dyer', 2, 'Autumn 2024, Autumn 2025'),
('Cian', 'Kendall', 1, 'Spring 2026'),
('Dan', 'Hudson', 4, 'Autumn 2023, Spring 2025, Spring 2026, Autumn 2026'),
('Darcelle', 'Chungh', 2, 'Spring 2025, Spring 2026'),
('Darcie', 'Fones', 1, 'Autumn 2025'),
('Destiny', 'Foote', 2, 'Autumn 2025, Autumn 2026'),
('Ellis', 'Hudson', 2, 'Spring 2026, Autumn 2026'),
('Emilia', 'Simpson', 2, 'Autumn 2024, Spring 2025'),
('Emily', 'Permineva', 2, 'Autumn 2025, Autumn 2026'),
('Eric', 'Komperda', 1, 'Spring 2026'),
('Eryk', 'Starzyk', 1, 'Spring 2025'),
('Eternity', 'Ahmed', 1, 'Autumn 2025'),
('Fabio', 'Persico', 1, 'Autumn 2023'),
('Felix', 'Cooke', 1, 'Autumn 2026'),
('Ghazi', 'Naqvi', 1, 'Spring 2026'),
('Hanna', 'Rosa', 1, 'Autumn 2023'),
('Harry', 'Brailsford', 4, 'Autumn 2023, Autumn 2024, Spring 2025, Autumn 2025'),
('Harry', 'Scarff', 2, 'Autumn 2025, Spring 2026'),
('Hayden', 'Jones', 1, 'Spring 2026'),
('Hugo', 'Woch', 1, 'Autumn 2026'),
('Jak', 'Dicker', 1, 'Autumn 2023'),
('Jasmine', 'Gosal', 1, 'Spring 2026'),
('Jaydon', 'Gordon', 2, 'Autumn 2023, Spring 2025'),
('Jethro', 'Kumaradoss', 1, 'Autumn 2025'),
('Jethro', 'Bernish', 1, 'Spring 2026'),
('Jiajia', 'Chen', 1, 'Autumn 2026'),
('Joseph', 'Smyth', 1, 'Autumn 2023'),
('Joseph', 'Brown', 1, 'Spring 2025'),
('Joshua', 'Bowers', 1, 'Spring 2026'),
('Kacie', 'Lacey', 3, 'Spring 2025, Autumn 2025, Spring 2026'),
('Kai', 'Palmer', 1, 'Autumn 2023'),
('Kai', 'Wibberley', 1, 'Autumn 2026'),
('Keira', 'Kim', 2, 'Autumn 2025, Autumn 2026'),
('Kynsley', 'Roberts-Downing', 3, 'Autumn 2024, Spring 2025, Autumn 2025'),
('Leo', 'Fitzpatrick', 1, 'Autumn 2026'),
('Leo', 'ROLLING', 2, 'Spring 2026, Autumn 2026'),
('Leon', 'Brathwaite', 1, 'Autumn 2026'),
('Leonardo', 'Sellers-brown', 1, 'Spring 2026'),
('Leonidas', 'Aravidis', 2, 'Spring 2025, Spring 2026'),
('Logan', 'Greenhouse', 2, 'Spring 2025, Spring 2026'),
('Maceo', 'Palmer', 1, 'Autumn 2023'),
('Maciej', 'Salamon', 1, 'Autumn 2024'),
('Mason', 'Dhinsa', 1, 'Autumn 2024'),
('Mason', 'Boyland', 2, 'Autumn 2024, Spring 2025'),
('Millan', 'Rai', 4, 'Autumn 2023, Autumn 2024, Autumn 2025, Spring 2026'),
('Monica', 'Tamber', 2, 'Spring 2025, Spring 2026'),
('Myah', 'Saini', 2, 'Autumn 2024, Spring 2025'),
('Naday-Ali', 'Naqvi', 1, 'Autumn 2026'),
('Nadine', 'Horan-Martin', 1, 'Autumn 2026'),
('Niall', 'Meakin', 1, 'Spring 2026'),
('Nima', 'Namdari', 2, 'Spring 2025, Spring 2026'),
('Noah', 'Matoso', 2, 'Spring 2025, Autumn 2025'),
('Oskar', 'Gabzdyl', 1, 'Autumn 2025'),
('Prudence', 'Roberts-Downing', 1, 'Autumn 2025'),
('Ryan', 'Waters', 1, 'Autumn 2023'),
('Sam', 'Mycock', 1, 'Autumn 2023'),
('Sarah', 'Fletcher', 1, 'Autumn 2024'),
('Serena', 'Deyal', 1, 'Autumn 2026'),
('Simran', 'Chandi', 2, 'Spring 2026, Autumn 2026'),
('Sophie', 'Tamber', 2, 'Autumn 2025, Autumn 2026'),
('Teddy', 'Stephenson', 2, 'Spring 2025, Autumn 2026'),
('Tilly-Mae', 'Haseldine', 1, 'Autumn 2026'),
('Xavier', 'Matuszek', 1, 'Autumn 2026');

update students s set bbbc_courses = b.courses, bbbc_dates = b.dates
from kc_bbbc_t b, members m
where m.id = s.member_id and lower(trim(m.first_name)) = lower(b.first) and lower(trim(m.last_name)) = lower(b.last);

notify pgrst, 'reload schema';

select b.first || ' ' || b.last as not_matched_in_app, b.courses, b.dates from kc_bbbc_t b
where not exists (select 1 from students s join members m on m.id = s.member_id
                  where lower(trim(m.first_name)) = lower(b.first) and lower(trim(m.last_name)) = lower(b.last))
order by 1;
