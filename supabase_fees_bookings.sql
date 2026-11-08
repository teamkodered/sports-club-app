-- 🧾 FEES & BOOKINGS in Sell: gradings (coloured / Brown / Black belt prices), BBBC courses and Level Up.
-- A booking = a student + a fee item (+ their grading request for gradings); payments can be split
-- (deposit, part, rest later), by cash / card / bank transfer; a booking with nothing paid = owed.
create or replace function public.kc_fees_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where auth_id = auth.uid() and role in ('admin', 'captain', 'coach', 'leader', 'head_coach'))
$$;

create table if not exists public.fee_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                 -- grading | bbbc | levelup
  band text,                          -- gradings: standard | brown | black
  name text not null,
  price numeric not null default 0,
  event_date date,                    -- courses / Level Up: the date (optional)
  places int,                         -- optional limit
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz default now()
);
create table if not exists public.fee_bookings (
  id uuid primary key default gen_random_uuid(),
  fee_item_id uuid not null references public.fee_items(id) on delete cascade,
  student_id uuid,
  customer_name text,
  price numeric not null default 0,          -- what they owe in total
  grading_request_id uuid,                   -- gradings: their grading request
  attended boolean not null default false,   -- courses / Level Up
  bbbc_counted boolean not null default false,
  note text,
  created_by uuid, created_by_name text,
  created_at timestamptz default now()
);
create table if not exists public.fee_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.fee_bookings(id) on delete cascade,
  amount numeric not null,
  method text not null,                      -- cash | card | transfer
  taken_by uuid, taken_by_name text,
  created_at timestamptz default now()
);
alter table public.fee_items enable row level security;
alter table public.fee_bookings enable row level security;
alter table public.fee_payments enable row level security;
drop policy if exists fee_items_read on public.fee_items;
create policy fee_items_read on public.fee_items for select using ((select public.kc_fees_staff()));
drop policy if exists fee_items_admin on public.fee_items;
create policy fee_items_admin on public.fee_items for all
  using (exists (select 1 from members where auth_id = (select auth.uid()) and role = 'admin'))
  with check (exists (select 1 from members where auth_id = (select auth.uid()) and role = 'admin'));
drop policy if exists fee_bookings_staff on public.fee_bookings;
create policy fee_bookings_staff on public.fee_bookings for all using ((select public.kc_fees_staff())) with check ((select public.kc_fees_staff()));
drop policy if exists fee_payments_staff on public.fee_payments;
create policy fee_payments_staff on public.fee_payments for all using ((select public.kc_fees_staff())) with check ((select public.kc_fees_staff()));

-- the three grading prices (edit them in Sell -> Fees & bookings -> ⚙️ Prices & courses)
insert into public.fee_items (kind, band, name, price, sort)
select * from (values ('grading', 'standard', 'Grading (coloured belts)', 0, 1), ('grading', 'brown', 'Grading (Brown belt)', 0, 2), ('grading', 'black', 'Black belt grading', 0, 3)) v(kind, band, name, price, sort)
where not exists (select 1 from public.fee_items where kind = 'grading');

-- BBBC attended: +1 course on the student's record (once per booking)
create or replace function public.kc_bbbc_attended(p_booking uuid, p_attended boolean)
returns void language plpgsql security definer set search_path = public as $$
declare b record; season text;
begin
  if not public.kc_fees_staff() then raise exception 'Not allowed'; end if;
  select fb.*, fi.kind, fi.event_date, fi.name as item_name into b from fee_bookings fb join fee_items fi on fi.id = fb.fee_item_id where fb.id = p_booking;
  if b is null then return; end if;
  update fee_bookings set attended = p_attended where id = p_booking;
  if b.kind = 'bbbc' and b.student_id is not null then
    season := case when extract(month from coalesce(b.event_date, current_date)) >= 7 then 'Autumn ' else 'Spring ' end || extract(year from coalesce(b.event_date, current_date))::int;
    if p_attended and not b.bbbc_counted then
      update students set bbbc_courses = coalesce(bbbc_courses, 0) + 1,
        bbbc_dates = case when coalesce(bbbc_dates, '') = '' then season when position(season in bbbc_dates) > 0 then bbbc_dates else bbbc_dates || ', ' || season end
      where id = b.student_id;
      update fee_bookings set bbbc_counted = true where id = p_booking;
    elsif not p_attended and b.bbbc_counted then
      update students set bbbc_courses = greatest(coalesce(bbbc_courses, 0) - 1, 0) where id = b.student_id;
      update fee_bookings set bbbc_counted = false where id = p_booking;
    end if;
  end if;
end $$;
grant execute on function public.kc_bbbc_attended(uuid, boolean) to authenticated;
notify pgrst, 'reload schema';
select kind, band, name, price from fee_items order by sort;
