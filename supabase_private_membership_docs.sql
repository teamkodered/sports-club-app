-- ════════════════════════════════════════════════════════════════════════
-- PRIVATE STORAGE FOR SIGNED MEMBERSHIP DOCUMENTS
-- New bucket 'membership-docs' (not public). Files are stored as <member id>/<file>.
-- They open only through short-lived signed links, and only for: staff, a head coach
-- (his students), a parent (their child, not 16+ with own login), or the member.
-- ════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('membership-docs', 'membership-docs', false)
on conflict (id) do update set public = false;

-- who may open a member's documents
create or replace function public.kc_can_view_member_docs(p_member uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from members where auth_id = auth.uid() and role in ('admin','captain','coach','leader'))
    or (public.kc_is_head_coach() and p_member in (select public.kc_my_coached_member_ids()))
    or p_member in (select public.kc_my_child_full_member_ids())
    or p_member in (select id from members where auth_id = auth.uid())
$$;
grant execute on function public.kc_can_view_member_docs(uuid) to authenticated;

-- the member id is the first folder of the path; guard against odd names
create or replace function public.kc_doc_member(p_name text)
returns uuid language plpgsql immutable as $$
begin
  return (string_to_array(p_name, '/'))[1]::uuid;
exception when others then return null;
end $$;

drop policy if exists "membership docs: read" on storage.objects;
create policy "membership docs: read" on storage.objects for select to authenticated
  using (bucket_id = 'membership-docs' and public.kc_can_view_member_docs(public.kc_doc_member(name)));

drop policy if exists "membership docs: staff upload" on storage.objects;
create policy "membership docs: staff upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'membership-docs' and public.kc_has_role(array['admin','captain','coach','leader']));

drop policy if exists "membership docs: staff change" on storage.objects;
create policy "membership docs: staff change" on storage.objects for update to authenticated
  using (bucket_id = 'membership-docs' and public.kc_has_role(array['admin','captain','coach','leader']));

drop policy if exists "membership docs: staff remove" on storage.objects;
create policy "membership docs: staff remove" on storage.objects for delete to authenticated
  using (bucket_id = 'membership-docs' and public.kc_has_role(array['admin','captain','coach','leader']));

-- Staff may remove the OLD public copies from athlete-media once moved (membership-forms/ folder only)
drop policy if exists "membership docs: staff remove old public copies" on storage.objects;
create policy "membership docs: staff remove old public copies" on storage.objects for delete to authenticated
  using (bucket_id = 'athlete-media' and name like 'membership-forms/%' and public.kc_has_role(array['admin','captain','coach','leader']));
