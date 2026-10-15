-- ════════════════════════════════════════════════════════════════════════
-- STOCK FROM THE 2026 TRADE PRICE LIST + PROFIT-BASED COMMISSION
-- Commission = % of PROFIT (sell − trade), 37.5% by default = half of DR's 75% share, as on
-- the price list. Monthly split: SJW 25% of profit, the selling coach's commission, DR the rest.
-- Price tiers per sale: PKA member (sell price), Instructor, Non-member.
-- ════════════════════════════════════════════════════════════════════════
alter table public.stock_items add column if not exists supplier text;
alter table public.stock_items add column if not exists instructor_price numeric(10,2);
alter table public.stock_items add column if not exists non_member_price numeric(10,2);
alter table public.stock_items alter column commission_pct set default 37.5;
alter table public.stock_sales add column if not exists cost_price numeric(10,2);
alter table public.stock_sales add column if not exists profit numeric(10,2);
alter table public.stock_sales add column if not exists price_tier text;

-- the three test items get the real prices
update public.stock_items set cost_price = 6.50,  sell_price = 13.50, instructor_price = 9.13,  supplier = 'PKA',   commission_pct = 37.5 where name = 'PKA T-shirt';
update public.stock_items set cost_price = 15.35, sell_price = 25.99, instructor_price = 19.34, supplier = 'Cimac / Adidas', commission_pct = 37.5 where name = 'Cimac Gloves 6oz';
update public.stock_items set cost_price = 17.75, sell_price = 28.99, instructor_price = 21.96, supplier = 'Cimac / Adidas', commission_pct = 37.5 where name = 'Cimac Gloves 10oz';

-- the rest of the price list (stock 0 -- add deliveries in Stock; add sizes under Items)
do $$
declare r record; iid uuid;
begin
  for r in select * from (values
  ('Adi Double sided pads', 'Equipment', 'Cimac / Adidas', 17.99, 27.99, 21.59, null),
  ('Adi Hand Wraps', 'Equipment', 'Cimac / Adidas', 4.61, 7.79, 5.80, null),
  ('Adi Hand wraps mexican', 'Equipment', 'Cimac / Adidas', 5.81, 9.79, 7.30, null),
  ('Adi PU Shins', 'Equipment', 'Cimac / Adidas', 19.99, 32.99, 24.86, null),
  ('Adi Rookie head guard', 'Equipment', 'Cimac / Adidas', 23.49, 44.99, 31.99, null),
  ('Adi Wako 10oz Gloves', 'Equipment', 'Cimac / Adidas', 41.99, 69.99, 52.49, null),
  ('Adi Wako Head Guard', 'Equipment', 'Cimac / Adidas', 59.99, 89.99, 71.24, null),
  ('Adi Wako Kicks', 'Equipment', 'Cimac / Adidas', 30.95, 47.79, 37.27, null),
  ('Adi Wako points Gloves', 'Equipment', 'Cimac / Adidas', 25.79, 39.99, 31.11, null),
  ('Cimac Focus Pads blk/red', 'Equipment', 'Cimac / Adidas', 19.19, 29.99, 23.09, null),
  ('Cimac Gloves 16oz', 'Equipment', 'Cimac / Adidas', 17.75, 28.99, 21.96, null),
  ('Cimac Hand wraps', 'Equipment', 'Cimac / Adidas', 2.81, 5.00, 3.63, null),
  ('Cimac Kick Shield blk/red', 'Equipment', 'Cimac / Adidas', 41.99, 64.97, 50.23, null),
  ('Cimac Kicks', 'Equipment', 'Cimac / Adidas', 15.59, 33.49, 22.87, null),
  ('Cimac Trousers', 'Clothing', 'Cimac / Adidas', 9.59, 16.00, 11.99, null),
  ('Cimac Cotton Shins', 'Equipment', 'Cimac / Adidas', 4.80, 7.80, 5.91, null),
  ('Cimac Head Guard', 'Equipment', 'Cimac / Adidas', 19.99, 38.99, 27.11, null),
  ('Cimac PU Shins', 'Equipment', 'Cimac / Adidas', 17.75, 28.99, 21.96, null),
  ('Cimac Strike Shield', 'Equipment', 'Cimac / Adidas', 15.59, 24.99, 19.11, null),
  ('T Sport Gum Shields', 'Equipment', 'Cimac / Adidas', 1.76, 3.50, 2.41, null),
  ('Adidas Bronze Gum', 'Equipment', 'Instructors list', 3.89, 7.79, 5.35, null),
  ('Adidas Pro glove', 'Equipment', 'Instructors list', 80.99, 129.79, 99.29, null),
  ('Adidas speed 50 10oz', 'Equipment', 'Instructors list', 22.79, 36.99, 28.12, null),
  ('Adidas speed 50 6oz', 'Equipment', 'Instructors list', 20.99, 33.99, 25.87, null),
  ('Cimac Groin Guard', 'Equipment', 'Instructors list', 5.03, 8.49, 6.33, null),
  ('Wako Elbow Pads', 'Equipment', 'Instructors list', 9.59, 14.79, 11.54, null),
  ('Kode Red Hoodie 100 (print)', 'Clothing', 'Kode Red', 29.88, 45.00, 35.55, 45.00),
  ('Kode Red Hoodie 200 (emb Frnt)', 'Clothing', 'Kode Red', 27.00, 45.00, 33.75, null),
  ('Kode Red KR T Shirt (RED)', 'Clothing', 'Kode Red', 10.00, 17.50, 12.81, null),
  ('Kode Red KR T Shirts Print', 'Clothing', 'Kode Red', 10.00, 15.00, 11.88, null),
  ('Kode Red Premium Uniform', 'Clothing', 'Kode Red', 50.00, 75.00, 59.38, null),
  ('Tracksuit top BIG Print', 'Clothing', 'Kode Red', 14.00, 16.00, 14.75, null),
  ('DPKA Hood', 'Clothing', 'PKA', 25.00, 39.99, 30.62, null),
  ('PKA Shorts adlt', 'Clothing', 'PKA', 24.00, 29.99, 26.25, null),
  ('PKA Shorts jnr', 'Clothing', 'PKA', 16.50, 29.99, 21.56, null),
  ('Avant Headguard', 'Equipment', 'Top Ten', 70.85, 104.99, 83.66, null),
  ('Mesh trousers w print', 'Clothing', 'Top Ten', 36.34, 56.49, 43.59, null),
  ('Mesh vneck w print', 'Clothing', 'Top Ten', 37.13, 51.49, 41.74, null),
  ('Top Ten Shorts', 'Clothing', 'Top Ten', 30.85, 45.99, 36.53, null),
  ('Top Ten Vest', 'Clothing', 'Top Ten', 34.50, 48.49, 39.75, null),
  ('Wako basic LC top w print', 'Clothing', 'Top Ten', 31.95, 36.49, 33.65, null)
  ) as t(name, category, supplier, cost, sell, instr, nonm)
  loop
    if not exists (select 1 from stock_items where lower(name) = lower(r.name)) then
      insert into stock_items (name, category, supplier, cost_price, sell_price, instructor_price, non_member_price, commission_pct, low_stock)
      values (r.name, r.category, r.supplier, r.cost, r.sell, r.instr, r.nonm, 37.5, 1) returning id into iid;
      insert into stock_variants (item_id, label, qty, sort) values (iid, 'One size', 0, 1);
    end if;
  end loop;
end $$;

-- monthly profit split
insert into public.settings (key, value) values ('stock_profit_split', '{"partner": "SJW", "partner_pct": 25}'::jsonb)
on conflict (key) do nothing;

-- record a sale: price tier, discount, profit, commission on profit (admins only)
create or replace function public.kc_stock_sale(p_variant uuid, p_qty int, p_unit numeric, p_disc_type text, p_disc_value numeric,
  p_disc_name text, p_coach uuid, p_student uuid, p_customer text, p_payment text, p_tier text)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v stock_variants; it stock_items; gross numeric; net numeric; prof numeric; sid uuid; me uuid;
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
  prof := round(net - coalesce(it.cost_price, 0) * p_qty, 2);
  insert into stock_sales (item_id, variant_id, item_name, variant_label, qty, unit_price, discount_type, discount_value, discount_name, total,
    cost_price, profit, price_tier, coach_member_id, commission_pct, commission_amount, student_id, customer_name, payment_method, created_by)
  values (it.id, v.id, it.name, v.label, p_qty, p_unit, coalesce(p_disc_type, 'none'), coalesce(p_disc_value, 0), p_disc_name, net,
    it.cost_price, prof, coalesce(p_tier, 'member'), p_coach,
    case when p_coach is null then 0 else it.commission_pct end,
    case when p_coach is null then 0 else greatest(round(prof * it.commission_pct / 100, 2), 0) end,
    p_student, nullif(trim(p_customer), ''), p_payment, me)
  returning id into sid;
  update stock_variants set qty = qty - p_qty where id = v.id;
  insert into stock_moves (variant_id, item_id, change, reason, sale_id, created_by) values (v.id, it.id, -p_qty, 'sale', sid, me);
  return sid;
end $fn$;
grant execute on function public.kc_stock_sale(uuid, int, numeric, text, numeric, text, uuid, uuid, text, text, text) to authenticated;
