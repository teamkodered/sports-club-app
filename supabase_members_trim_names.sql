-- Names are saved without spaces at the start/end (a trailing space stopped searches finding people, Oct 2026)
create or replace function public.kc_trim_member_names()
returns trigger language plpgsql as $$
begin
  new.first_name := trim(new.first_name);
  new.last_name  := trim(new.last_name);
  new.email      := trim(new.email);
  return new;
end $$;
drop trigger if exists kc_trim_member_names on public.members;
create trigger kc_trim_member_names before insert or update of first_name, last_name, email on public.members
  for each row execute function public.kc_trim_member_names();
