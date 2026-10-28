-- Coach / Leader class list: ignore anything in their ticked classes that isn't a real class id
-- (one stray entry made the whole list fail, so the login saw no students at all), and use their
-- staff record first if they have more than one member record.
create or replace function public.kc_my_class_ids()
returns setof uuid language plpgsql stable security definer set search_path = public as $$
declare a jsonb; own jsonb; g jsonb;
begin
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
