-- FULL REGISTERS for a shared centre login (e.g. the "K R" Leader login):
-- every register, every class and every current student -- like Admin, but ONLY for registers
-- (attendance, points, class lists). CRM, settings, forms etc. stay as limited as before.
-- Switched on per login with access.full_registers = true (Settings -> Team -> "Full registers").

create or replace function public.kc_full_registers()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where auth_id = auth.uid()
                 and role in ('head_coach','captain','coach','leader')
                 and coalesce((access ->> 'full_registers')::boolean, false))
$$;
grant execute on function public.kc_full_registers() to authenticated;

-- classes this login may take: all of them with Full registers, else their ticked ones
-- (ignoring any stray non-class entries; their staff record first if they have two)
create or replace function public.kc_my_class_ids()
returns setof uuid language plpgsql stable security definer set search_path = public as $$
declare a jsonb; own jsonb; g jsonb;
begin
  if public.kc_full_registers() then
    return query select id from classes;
    return;
  end if;
  select access into a from members where auth_id = auth.uid() and role in ('head_coach','captain','coach','leader')
    order by (role = 'head_coach') desc limit 1;
  if a is null then return; end if;
  own := a -> 'registers' -> 'classes';
  if own is null and a ? 'group' then
    select x into g from settings s, jsonb_array_elements(s.value) x where s.key = 'access_groups' and x ->> 'id' = a ->> 'group' limit 1;
    own := g -> 'access' -> 'registers' -> 'classes';
  end if;
  return query
    select v::uuid from jsonb_array_elements_text(case when jsonb_typeof(own) = 'array' then own else '[]'::jsonb end) v
    where v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
end $$;

-- students this login may see and mark: everyone with Full registers, else those in their classes
create or replace function public.kc_my_coached_student_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from students where public.kc_full_registers()
  union
  select distinct a.student_id from student_class_assignments a
  where not public.kc_full_registers()
    and a.class_id in (select public.kc_my_class_ids())
    and (a.end_date is null or a.end_date >= current_date)
$$;

-- switch it on for the shared KR centre login (K R)
update members set access = coalesce(access, '{}'::jsonb) || '{"full_registers": true}'::jsonb
where first_name = 'K' and last_name = 'R' and role = 'leader'
returning first_name, last_name, role, access ->> 'full_registers' as full_registers;
