-- ════════════════════════════════════════════════════════════════════════
-- CRM DATA: ADMIN ONLY (plus the Head Coach's venue rules, parents' own requests
-- and the public forms, which stay as they are).
-- Removes the "any staff" rules (which let Coaches / Leaders read CRM data) on the
-- CRM tables, and adds one admin-only rule per table.
-- RUN STEP 1 FIRST and check the list; then run STEP 2.
-- ════════════════════════════════════════════════════════════════════════

-- STEP 1 — PREVIEW: the rules that will be replaced (staff-wide rules on CRM tables)
select tablename, policyname, cmd, coalesce(qual, '') || ' ' || coalesce(with_check, '') as rule
from pg_policies
where schemaname = 'public'
  and tablename in ('enquiries','payer_links','standing_order_uploads','grading_expressions','join_applications',
                    'course_interest','notice_sends','absence_requests','contact_update_requests','app_invites',
                    'stock_items','stock_variants','stock_sales','stock_moves')
  and (coalesce(qual, '') || coalesce(with_check, '')) ~* '(captain|leader|kc_is_staff|kc_is_any_staff|kc_has_role|''coach'')'
  and (coalesce(qual, '') || coalesce(with_check, '')) !~* '(kc_is_head_coach|kc_my_child|kc_my_member_ids|kc_my_student_ids)'
order by tablename, policyname;


-- STEP 2 — APPLY (run on its own, after checking step 1)
do $$
declare r record; t text;
  tabs text[] := array['enquiries','payer_links','standing_order_uploads','grading_expressions','join_applications',
                       'course_interest','notice_sends','absence_requests','contact_update_requests','app_invites',
                       'stock_items','stock_variants','stock_sales','stock_moves'];
begin
  -- remove the staff-wide rules (keeps head coach / parent / own / public rules)
  for r in select tablename, policyname from pg_policies
           where schemaname = 'public' and tablename = any(tabs)
             and (coalesce(qual, '') || coalesce(with_check, '')) ~* '(captain|leader|kc_is_staff|kc_is_any_staff|kc_has_role|''coach'')'
             and (coalesce(qual, '') || coalesce(with_check, '')) !~* '(kc_is_head_coach|kc_my_child|kc_my_member_ids|kc_my_student_ids)'
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    raise notice 'removed % on %', r.policyname, r.tablename;
  end loop;
  -- one admin-only rule per table (tables that exist)
  foreach t in array tabs loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', t || '_admin', t);
      execute format('create policy %I on public.%I for all using (public.kc_has_role(array[''admin''])) with check (public.kc_has_role(array[''admin'']))', t || '_admin', t);
    end if;
  end loop;
end $$;

-- Stock sales / refunds / adjustments: admin only too
create or replace function public.kc_stock_can() returns boolean language sql stable security definer set search_path = public as $$
  select public.kc_has_role(array['admin'])
$$;

create or replace function public.kc_stock_sale(p_variant uuid, p_qty int, p_unit numeric, p_disc_type text, p_disc_value numeric,
  p_disc_name text, p_coach uuid, p_student uuid, p_customer text, p_payment text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v stock_variants; it stock_items; gross numeric; net numeric; sid uuid; me uuid;
begin
  if not public.kc_has_role(array['admin']) then raise exception 'Admins only'; end if;
  if p_qty is null or p_qty < 1 then raise exception 'Quantity must be at least 1'; end if;
  select * into v from stock_variants where id = p_variant for update;
  if v.id is null then raise exception 'Item not found'; end if;
  select * into it from stock_items where id = v.item_id;
  select id into me from members where auth_id = auth.uid() limit 1;
  gross := round(p_unit * p_qty, 2);
  net := case p_disc_type when 'pct' then round(gross * (1 - least(greatest(p_disc_value, 0), 100) / 100), 2)
                          when 'amount' then greatest(gross - greatest(p_disc_value, 0), 0) else gross end;
  insert into stock_sales (item_id, variant_id, item_name, variant_label, qty, unit_price, discount_type, discount_value, discount_name, total,
    coach_member_id, commission_pct, commission_amount, student_id, customer_name, payment_method, created_by)
  values (it.id, v.id, it.name, v.label, p_qty, p_unit, coalesce(p_disc_type, 'none'), coalesce(p_disc_value, 0), p_disc_name, net,
    p_coach, case when p_coach is null then 0 else it.commission_pct end,
    case when p_coach is null then 0 else round(net * it.commission_pct / 100, 2) end,
    p_student, nullif(trim(p_customer), ''), p_payment, me)
  returning id into sid;
  update stock_variants set qty = qty - p_qty where id = v.id;
  insert into stock_moves (variant_id, item_id, change, reason, sale_id, created_by) values (v.id, it.id, -p_qty, 'sale', sid, me);
  return sid;
end $$;

create or replace function public.kc_stock_refund(p_sale uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s stock_sales; me uuid;
begin
  if not public.kc_has_role(array['admin']) then raise exception 'Admins only'; end if;
  select * into s from stock_sales where id = p_sale for update;
  if s.id is null or s.refunded_at is not null then return; end if;
  select id into me from members where auth_id = auth.uid() limit 1;
  update stock_sales set refunded_at = now() where id = s.id;
  update stock_variants set qty = qty + s.qty where id = s.variant_id;
  insert into stock_moves (variant_id, item_id, change, reason, sale_id, created_by) values (s.variant_id, s.item_id, s.qty, 'refund', s.id, me);
end $$;

create or replace function public.kc_stock_adjust(p_variant uuid, p_change int, p_reason text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v stock_variants; me uuid;
begin
  if not public.kc_has_role(array['admin']) then raise exception 'Admins only'; end if;
  select * into v from stock_variants where id = p_variant for update;
  if v.id is null then raise exception 'Item not found'; end if;
  select id into me from members where auth_id = auth.uid() limit 1;
  update stock_variants set qty = qty + p_change where id = v.id;
  insert into stock_moves (variant_id, item_id, change, reason, note, created_by) values (v.id, v.item_id, p_change, coalesce(p_reason, 'adjust'), p_note, me);
end $$;
