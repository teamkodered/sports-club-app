-- UNDO for the athlete awards fix: removes the three functions (the app falls back to its old behaviour)
drop function if exists public.kc_award_my_points(text, text);
drop function if exists public.kc_revoke_my_f2f_point(text);
drop function if exists public.kc_set_my_weight(numeric);
