-- Saves a join-form application (member + student + membership form) in ONE
-- transaction, so a failure part-way can no longer leave a half-saved member
-- behind. If an earlier attempt already left a half-saved member (same
-- member_id, no student record), this finishes that record instead of failing
-- with "duplicate key value violates unique constraint members_member_id_key".
-- Safe to run more than once (create or replace).

create or replace function public.submit_join_application(
  p_member jsonb, p_student jsonb, p_form jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text := p_member->>'member_id';
  v_existing_id uuid;
  v_member_id uuid;
  v_cols text;
  v_member jsonb;
  v_student jsonb;
  v_form jsonb;
begin
  if v_ref is null or v_ref = '' then
    raise exception 'Missing member reference';
  end if;

  -- Public applicants can only ever create a pending, ordinary member
  v_member := (p_member - 'role' - 'status') || jsonb_build_object('role', 'member', 'status', 'pending');

  select m.id into v_existing_id from members m where m.member_id = v_ref limit 1;

  if v_existing_id is not null then
    if exists (select 1 from students s where s.member_id = v_existing_id) then
      raise exception 'ALREADY_REGISTERED' using hint = 'A member with these details is already registered.';
    end if;
    -- Half-saved from an earlier attempt: bring it up to date and reuse it
    v_member_id := v_existing_id;
    v_member := v_member - 'id' - 'member_id';
    select string_agg(quote_ident(k), ', ') into v_cols
      from jsonb_object_keys(v_member) k
      where exists (select 1 from information_schema.columns c
                    where c.table_schema = 'public' and c.table_name = 'members' and c.column_name = k);
    if v_cols is not null then
      execute format('update members set (%1$s) = (select %1$s from jsonb_populate_record(null::members, $1)) where id = $2', v_cols)
        using v_member, v_member_id;
    end if;
  else
    v_member_id := coalesce((v_member->>'id')::uuid, gen_random_uuid());
    v_member := v_member || jsonb_build_object('id', v_member_id);
    select string_agg(quote_ident(k), ', ') into v_cols
      from jsonb_object_keys(v_member) k
      where exists (select 1 from information_schema.columns c
                    where c.table_schema = 'public' and c.table_name = 'members' and c.column_name = k);
    execute format('insert into members (%1$s) select %1$s from jsonb_populate_record(null::members, $1)', v_cols)
      using v_member;
  end if;

  -- Student record
  v_student := p_student || jsonb_build_object('member_id', v_member_id);
  select string_agg(quote_ident(k), ', ') into v_cols
    from jsonb_object_keys(v_student) k
    where exists (select 1 from information_schema.columns c
                  where c.table_schema = 'public' and c.table_name = 'students' and c.column_name = k);
  execute format('insert into students (%1$s) select %1$s from jsonb_populate_record(null::students, $1)', v_cols)
    using v_student;

  -- Membership form (a problem here shouldn't lose the whole application)
  if p_form is not null then
    begin
      v_form := p_form || jsonb_build_object('member_id', v_member_id);
      select string_agg(quote_ident(k), ', ') into v_cols
        from jsonb_object_keys(v_form) k
        where exists (select 1 from information_schema.columns c
                      where c.table_schema = 'public' and c.table_name = 'membership_forms' and c.column_name = k);
      execute format('insert into membership_forms (%1$s) select %1$s from jsonb_populate_record(null::membership_forms, $1)', v_cols)
        using v_form;
    exception when others then
      raise warning 'membership_forms insert failed for %: %', v_ref, sqlerrm;
    end;
  end if;

  return v_member_id;
end;
$$;

grant execute on function public.submit_join_application(jsonb, jsonb, jsonb) to anon, authenticated;
