-- Per-person access (Settings -> Team). Safe to run more than once.
-- 1. Where each person's page / register access overrides are stored
alter table public.members add column if not exists access jsonb;

-- 2. Only admins may change anyone's role or access (a member editing their
--    own profile can't give themselves more access)
create or replace function public.protect_member_role_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.access is distinct from old.access)
     and not exists (select 1 from members where auth_id = auth.uid() and role = 'admin')
     and auth.uid() is not null then
    raise exception 'Only an admin can change roles or access';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_member_role_access on public.members;
create trigger protect_member_role_access
  before update on public.members
  for each row execute function public.protect_member_role_access();
