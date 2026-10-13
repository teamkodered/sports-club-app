-- Head Coach membership forms: VENUE ONLY.
-- He sees the membership forms (and signed documents) of students in his Derby Moore / Moorways
-- classes -- never KR Centre students, even in KR Centre classes he takes.
create or replace function public.kc_my_venue_member_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct s.member_id
  from student_class_assignments a
  join classes c on c.id = a.class_id
  join students s on s.id = a.student_id
  where a.class_id in (select public.kc_my_class_ids())
    and (c.name ilike '%derby moore%' or c.name ilike '%moorway%')
$$;
grant execute on function public.kc_my_venue_member_ids() to authenticated;

drop policy if exists forms_read_coach on public.membership_forms;
create policy forms_read_coach on public.membership_forms for select
  using (public.kc_is_head_coach() and member_id in (select public.kc_my_venue_member_ids()));

-- signed documents follow the same rule
create or replace function public.kc_can_view_member_docs(p_member uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.kc_has_role(array['admin'])
    or (public.kc_is_head_coach() and p_member in (select public.kc_my_venue_member_ids()))
    or p_member in (select public.kc_my_child_full_member_ids())
    or p_member in (select id from members where auth_id = auth.uid())
$$;

-- (Check as Mark: run separately -- see the leak test pattern; never in the same run as the changes above)
