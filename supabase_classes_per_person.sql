-- Classes are each person's own: a team group (e.g. PKA Coach) shares pages + register tabs,
-- but the classes come from the person's own ticks first (falling back to the group's).
create or replace function public.kc_my_class_ids()
returns setof uuid language plpgsql stable security definer set search_path = public as $$
declare a jsonb; own jsonb; g jsonb;
begin
  select access into a from members where auth_id = auth.uid() and role in ('head_coach','captain','coach','leader') limit 1;
  if a is null then return; end if;
  own := a -> 'registers' -> 'classes';
  if own is null and a ? 'group' then
    select x into g from settings s, jsonb_array_elements(s.value) x where s.key = 'access_groups' and x ->> 'id' = a ->> 'group' limit 1;
    own := g -> 'access' -> 'registers' -> 'classes';
  end if;
  return query select (jsonb_array_elements_text(coalesce(own, '[]'::jsonb)))::uuid;
end $$;
