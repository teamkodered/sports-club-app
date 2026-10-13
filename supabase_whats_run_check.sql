-- WHICH SQL FILES HAVE BEEN RUN? (read-only -- changes nothing)
-- Paste into the Supabase SQL editor and run. It looks for something each recent SQL file creates
-- and lists every file as RUN or NOT RUN (not-run ones first). Uses a temporary scratch table that
-- disappears when the editor session ends.

create temp table if not exists kc_sql_check (file text, what text, run boolean);
truncate kc_sql_check;

do $$
declare
  fn  text;
  -- helpers as inline checks
begin
  -- functions: file, function name
  for fn in select unnest(array[
    'supabase_krfight_progress.sql|krfight_change_style',
    'supabase_stock.sql|kc_stock_sale',
    'supabase_crm_admin_only.sql|kc_stock_can',
    'supabase_head_coach_forms_venue_only.sql|kc_my_venue_member_ids',
    'supabase_coach_leader_restriction.sql|kc_is_class_staff',
    'supabase_my_attendance_update.sql|kc_my_attendance_update',
    'supabase_login_duplicates_fix.sql|kc_trg_member_no_duplicate',
    'supabase_claim_has_login.sql|kc_student_has_login',
    'supabase_private_membership_docs.sql|kc_doc_member',
    'supabase_parent_view.sql|kc_redeem_invite',
    'supabase_head_coach_standing_orders.sql|kc_trg_so_upload_venue',
    'supabase_head_coach_crm.sql|kc_trg_enquiry_venue',
    'supabase_enquiry_attended_matching.sql|kc_match_enquiries',
    'supabase_venues_join_forms_head_coach.sql|kc_join_venue_from_payload',
    'supabase_head_coach_step_b.sql|kc_is_head_coach',
    'supabase_league_board.sql|public_f2f_tasks',
    'supabase_athlete_awards_fix.sql|kc_set_my_weight',
    'supabase_privacy_step_a.sql|kc_search_athletes'
  ]) loop
    insert into kc_sql_check values (split_part(fn, '|', 1), 'function ' || split_part(fn, '|', 2),
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = split_part(fn, '|', 2)));
  end loop;

  -- tables
  insert into kc_sql_check values ('supabase_other_sessions.sql', 'table extra_sessions', to_regclass('public.extra_sessions') is not null);
  insert into kc_sql_check values ('supabase_focus_notes.sql', 'table focus_notes', to_regclass('public.focus_notes') is not null);

  -- columns
  insert into kc_sql_check values ('supabase_krfight_progress.sql (stage 3 part)', 'column krfight_profiles.style_xp',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'krfight_profiles' and column_name = 'style_xp'));
  insert into kc_sql_check values ('supabase_enquiry_for.sql', 'column enquiries.enquiry_for',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'enquiries' and column_name = 'enquiry_for'));
  insert into kc_sql_check values ('supabase_enquiry_contact_count.sql', 'column enquiries.contact_count',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'enquiries' and column_name = 'contact_count'));
  insert into kc_sql_check values ('supabase_test_sets.sql', 'column fit2fight_sessions.test_sets',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fit2fight_sessions' and column_name = 'test_sets'));
  insert into kc_sql_check values ('supabase_class_assignment_dates.sql', 'column student_class_assignments.start_date',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'student_class_assignments' and column_name = 'start_date'));

  -- policies
  insert into kc_sql_check values ('supabase_fix_f2f_session_updates.sql', 'policy f2f_update',
    exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'f2f_update'));
  insert into kc_sql_check values ('supabase_fix_members_update_recursion.sql', 'policy members_update_own',
    exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'members_update_own'));

  -- storage bucket
  insert into kc_sql_check values ('supabase_private_membership_docs.sql (bucket)', 'private bucket membership-docs',
    exists (select 1 from storage.buckets where id = 'membership-docs'));

  -- enquiry status values (only matters if the enquiries table has a status check at all)
  insert into kc_sql_check values ('supabase_enquiry_sent_to_venues.sql', 'enquiry status allows sent_derby_moore',
    not exists (select 1 from pg_constraint where conrelid = 'public.enquiries'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%')
    or exists (select 1 from pg_constraint where conrelid = 'public.enquiries'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%sent_derby_moore%'));

  -- one-off data loads
  if to_regclass('public.focus_notes') is not null then
    execute $q$ insert into kc_sql_check select 'supabase_focus_and_format_load.sql', 'focus notes history loaded', (select count(*) > 0 from public.focus_notes) $q$;
  else
    insert into kc_sql_check values ('supabase_focus_and_format_load.sql', 'focus notes history loaded (needs focus_notes table first)', false);
  end if;
  insert into kc_sql_check values ('supabase_focus_and_format_load.sql (format)', 'Format card text saved',
    exists (select 1 from public.settings where key = 'dashboard_format'));
end $$;

select case when run then 'RUN' else 'NOT RUN' end as status, file, what
from kc_sql_check
order by run, file;
