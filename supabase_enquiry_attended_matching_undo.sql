-- UNDO: stop automatic matching (enquiries already moved to Attended stay as they are)
drop trigger if exists kc_match_enquiries_member on public.members;
drop trigger if exists kc_match_enquiries_student on public.students;
drop function if exists public.kc_trg_match_member();
drop function if exists public.kc_trg_match_student();
drop function if exists public.kc_match_enquiries(uuid, text[], text[]);
