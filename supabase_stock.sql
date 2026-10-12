-- ════════════════════════════════════════════════════════════════════════
-- CRM STOCK: items + variants (sizes), stock movements, sales with discounts
-- and coach commission. Staff only. Sales / stock changes go through functions
-- so the stock count, the sale and the log always stay in step.
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  name text not null, category text,
  cost_price numeric(10,2) not null default 0, sell_price numeric(10,2) not null default 0,
  commission_pct numeric(5,2) not null default 10, low_stock int not null default 3,
  active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.stock_variants (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.stock_items(id) on delete cascade,
  label text not null, qty int not null default 0, sort int not null default 0
);
create table if not exists public.stock_sales (
  id uuid primary key default gen_random_uuid(),
  sold_at timestamptz not null default now(),
  item_id uuid references public.stock_items(id), variant_id uuid references public.stock_variants(id),
  item_name text, variant_label text, qty int not null,
  unit_price numeric(10,2) not null, discount_type text not null default 'none', discount_value numeric(10,2) not null default 0,
  discount_name text, total numeric(10,2) not null,
  coach_member_id uuid references public.members(id), commission_pct numeric(5,2) not null default 0, commission_amount numeric(10,2) not null default 0,
  commission_paid_at timestamptz,
  student_id uuid references public.students(id), customer_name text, payment_method text,
  refunded_at timestamptz, created_by uuid references public.members(id)
);
create table if not exists public.stock_moves (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid references public.stock_variants(id) on delete cascade, item_id uuid references public.stock_items(id) on delete cascade,
  change int not null, reason text not null, note text, sale_id uuid references public.stock_sales(id),
  created_by uuid references public.members(id), created_at timestamptz not null default now()
);

-- ── record a sale: price, discount, commission worked out here; stock goes down ──
create or replace function public.kc_stock_sale(p_variant uuid, p_qty int, p_unit numeric, p_disc_type text, p_disc_value numeric,
  p_disc_name text, p_coach uuid, p_student uuid, p_customer text, p_payment text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v stock_variants; it stock_items; gross numeric; net numeric; sid uuid; me uuid;
begin
  if not public.kc_has_role(array['admin','captain','coach','leader']) then raise exception 'Staff only'; end if;
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

-- ── refund a sale: stock goes back, commission no longer counts ──
create or replace function public.kc_stock_refund(p_sale uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s stock_sales; me uuid;
begin
  if not public.kc_has_role(array['admin','captain','coach','leader']) then raise exception 'Staff only'; end if;
  select * into s from stock_sales where id = p_sale for update;
  if s.id is null or s.refunded_at is not null then return; end if;
  select id into me from members where auth_id = auth.uid() limit 1;
  update stock_sales set refunded_at = now() where id = s.id;
  update stock_variants set qty = qty + s.qty where id = s.variant_id;
  insert into stock_moves (variant_id, item_id, change, reason, sale_id, created_by) values (s.variant_id, s.item_id, s.qty, 'refund', s.id, me);
end $$;

-- ── delivery / count correction ──
create or replace function public.kc_stock_adjust(p_variant uuid, p_change int, p_reason text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v stock_variants; me uuid;
begin
  if not public.kc_has_role(array['admin','captain','coach','leader']) then raise exception 'Staff only'; end if;
  select * into v from stock_variants where id = p_variant for update;
  if v.id is null then raise exception 'Item not found'; end if;
  select id into me from members where auth_id = auth.uid() limit 1;
  update stock_variants set qty = qty + p_change where id = v.id;
  insert into stock_moves (variant_id, item_id, change, reason, note, created_by) values (v.id, v.item_id, p_change, coalesce(p_reason, 'adjust'), p_note, me);
end $$;
grant execute on function public.kc_stock_sale(uuid, int, numeric, text, numeric, text, uuid, uuid, text, text), public.kc_stock_refund(uuid), public.kc_stock_adjust(uuid, int, text, text) to authenticated;

-- ── rules: staff only ──
alter table public.stock_items enable row level security;
alter table public.stock_variants enable row level security;
alter table public.stock_sales enable row level security;
alter table public.stock_moves enable row level security;
drop policy if exists stock_items_staff on public.stock_items;
create policy stock_items_staff on public.stock_items for all using (public.kc_has_role(array['admin','captain','coach','leader'])) with check (public.kc_has_role(array['admin','captain','coach','leader']));
drop policy if exists stock_variants_staff on public.stock_variants;
create policy stock_variants_staff on public.stock_variants for all using (public.kc_has_role(array['admin','captain','coach','leader'])) with check (public.kc_has_role(array['admin','captain','coach','leader']));
drop policy if exists stock_sales_staff_read on public.stock_sales;
create policy stock_sales_staff_read on public.stock_sales for select using (public.kc_has_role(array['admin','captain','coach','leader']));
drop policy if exists stock_sales_admin_update on public.stock_sales;
create policy stock_sales_admin_update on public.stock_sales for update using (public.kc_has_role(array['admin']));   -- mark commission paid
drop policy if exists stock_moves_staff_read on public.stock_moves;
create policy stock_moves_staff_read on public.stock_moves for select using (public.kc_has_role(array['admin','captain','coach','leader']));

-- ── test items (placeholder prices -- change them in CRM -> Stock -> Items) ──
do $$
declare t uuid; g6 uuid; g10 uuid;
begin
  if not exists (select 1 from stock_items where name = 'PKA T-shirt') then
    insert into stock_items (name, category, cost_price, sell_price, commission_pct, low_stock) values ('PKA T-shirt', 'Clothing', 6, 15, 10, 2) returning id into t;
    insert into stock_variants (item_id, label, qty, sort) values
      (t, 'Age 3-4', 5, 1), (t, 'Age 5-6', 5, 2), (t, 'Age 7-8', 5, 3), (t, 'Age 9-11', 5, 4), (t, 'Age 12-13', 5, 5),
      (t, 'S', 5, 6), (t, 'M', 5, 7), (t, 'L', 5, 8), (t, 'XL', 5, 9);
  end if;
  if not exists (select 1 from stock_items where name = 'Cimac Gloves 6oz') then
    insert into stock_items (name, category, cost_price, sell_price, commission_pct, low_stock) values ('Cimac Gloves 6oz', 'Equipment', 20, 35, 10, 2) returning id into g6;
    insert into stock_variants (item_id, label, qty, sort) values (g6, 'Red', 4, 1), (g6, 'Blue', 4, 2);
  end if;
  if not exists (select 1 from stock_items where name = 'Cimac Gloves 10oz') then
    insert into stock_items (name, category, cost_price, sell_price, commission_pct, low_stock) values ('Cimac Gloves 10oz', 'Equipment', 24, 40, 10, 2) returning id into g10;
    insert into stock_variants (item_id, label, qty, sort) values (g10, 'Red', 4, 1), (g10, 'Blue', 4, 2);
  end if;
end $$;

-- discount presets (editable in the app)
insert into public.settings (key, value) values ('stock_discounts', '[
  {"name": "Member 10%", "type": "pct", "value": 10},
  {"name": "Sibling 15%", "type": "pct", "value": 15},
  {"name": "Coach / staff 20%", "type": "pct", "value": 20},
  {"name": "£5 off", "type": "amount", "value": 5}
]'::jsonb) on conflict (key) do nothing;
