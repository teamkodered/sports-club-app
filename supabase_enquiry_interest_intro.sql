-- Enquiries: what they're interested in long-term (a group) + their free intro session
alter table public.enquiries add column if not exists interest_group text;      -- Tiny Tots / Juniors / Adults / Ladies / Boxing
alter table public.enquiries add column if not exists intro_date date;          -- the intro session's date
alter table public.enquiries add column if not exists intro_class_id uuid references public.classes(id) on delete set null;
alter table public.enquiries add column if not exists intro_label text;         -- e.g. "Mixed, Monday 19.00 - 20.00, The KR Centre" (from a booking email)
