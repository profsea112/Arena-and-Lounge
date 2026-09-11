-- ROLES
CREATE TYPE public.app_role AS ENUM ('admin','ops_manager','staff','kitchen');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

CREATE POLICY "own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "read roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ARENA
CREATE TABLE public.arena_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  player_capacity int NOT NULL DEFAULT 20,
  gk_capacity int NOT NULL DEFAULT 2,
  price_per_player numeric NOT NULL DEFAULT 3000,
  price_full_pitch numeric NOT NULL DEFAULT 60000,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.arena_slots TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.arena_slots TO authenticated;
GRANT ALL ON public.arena_slots TO service_role;
ALTER TABLE public.arena_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "slots public read" ON public.arena_slots FOR SELECT USING (true);
CREATE POLICY "slots staff write" ON public.arena_slots FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES public.arena_slots(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT 'white',
  max_players int NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.teams TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teams public read" ON public.teams FOR SELECT USING (true);
CREATE POLICY "teams staff write" ON public.teams FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES public.arena_slots(id) ON DELETE CASCADE,
  booking_type text NOT NULL DEFAULT 'player',
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text,
  players_count int NOT NULL DEFAULT 1,
  goalkeepers_count int NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending',
  payment_method text NOT NULL DEFAULT 'paystack',
  ticket_code text NOT NULL UNIQUE,
  checked_in_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookings staff all" ON public.bookings FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER bookings_touch BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.booking_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  player_name text NOT NULL,
  is_goalkeeper boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_players TO authenticated;
GRANT ALL ON public.booking_players TO service_role;
ALTER TABLE public.booking_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players staff all" ON public.booking_players FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- LOUNGE
CREATE TABLE public.lounge_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  seats int NOT NULL DEFAULT 4,
  qr_slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'available',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lounge_tables TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lounge_tables TO authenticated;
GRANT ALL ON public.lounge_tables TO service_role;
ALTER TABLE public.lounge_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tables public read" ON public.lounge_tables FOR SELECT USING (true);
CREATE POLICY "tables staff write" ON public.lounge_tables FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid REFERENCES public.lounge_tables(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text,
  reserved_date date NOT NULL,
  reserved_time time NOT NULL,
  party_size int NOT NULL DEFAULT 2,
  status text NOT NULL DEFAULT 'confirmed',
  reference_code text NOT NULL UNIQUE,
  amount numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservations TO authenticated;
GRANT ALL ON public.reservations TO service_role;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reservations staff all" ON public.reservations FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.menu_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_categories TO authenticated;
GRANT ALL ON public.menu_categories TO service_role;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cats public read" ON public.menu_categories FOR SELECT USING (true);
CREATE POLICY "cats staff write" ON public.menu_categories FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'unit',
  quantity numeric NOT NULL DEFAULT 0,
  low_stock_threshold numeric NOT NULL DEFAULT 10,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory staff all" ON public.inventory_items FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER inventory_touch BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.menu_categories(id) ON DELETE SET NULL,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  price numeric NOT NULL DEFAULT 0,
  is_available boolean NOT NULL DEFAULT true,
  kind text NOT NULL DEFAULT 'food',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.menu_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_items TO authenticated;
GRANT ALL ON public.menu_items TO service_role;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items public read" ON public.menu_items FOR SELECT USING (true);
CREATE POLICY "items staff write" ON public.menu_items FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid REFERENCES public.lounge_tables(id) ON DELETE SET NULL,
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  order_type text NOT NULL DEFAULT 'qr',
  customer_name text NOT NULL DEFAULT 'Guest',
  status text NOT NULL DEFAULT 'pending',
  total numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending',
  assigned_staff_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reference_code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders staff all" ON public.orders FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER orders_touch BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order items staff all" ON public.order_items FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- SEED
INSERT INTO public.arena_slots (slot_date, start_time, end_time, player_capacity, gk_capacity, price_per_player, price_full_pitch)
SELECT (CURRENT_DATE + d)::date, t.s, t.e, 20, 2, 3000, 60000
FROM generate_series(0,6) AS d,
     (VALUES ('08:00'::time,'09:30'::time),('10:00','11:30'),('16:00','17:30'),('18:00','19:30'),('20:00','21:30')) AS t(s,e);

INSERT INTO public.teams (slot_id, name, color, max_players)
SELECT id, x.n, x.c, 10 FROM public.arena_slots,
 (VALUES ('Team Red','red'),('Team Blue','blue'),('Team Black','black')) AS x(n,c);

INSERT INTO public.lounge_tables (name, seats, qr_slug) VALUES
 ('Table 1',4,'t1'),('Table 2',4,'t2'),('Table 3',6,'t3'),('Table 4',6,'t4'),
 ('Table 5',2,'t5'),('Table 6',8,'t6'),('VIP Booth 1',6,'vip1'),('VIP Booth 2',6,'vip2');

INSERT INTO public.menu_categories (name, sort_order) VALUES
 ('Grills',1),('Small Chops',2),('Mains',3),('Soft Drinks',4),('Cocktails',5),('Beers',6);

INSERT INTO public.inventory_items (name, unit, quantity, low_stock_threshold) VALUES
 ('Chicken Wings','portions',80,20),('Suya Beef','portions',60,15),('Peppered Snail','portions',25,10),
 ('Jollof Rice','portions',100,25),('Fried Rice','portions',90,25),('Asun','portions',40,10),
 ('Coca-Cola','bottles',120,30),('Fanta','bottles',90,30),('Chapman','glasses',50,15),
 ('Mojito','glasses',40,12),('Star Lager','bottles',150,40),('Heineken','bottles',100,30),
 ('Bottled Water','bottles',200,50),('Plantain','portions',70,20);

INSERT INTO public.menu_items (category_id, inventory_item_id, name, description, price, kind)
SELECT c.id, i.id, i.name, d.descr, d.price, d.kind
FROM (VALUES
 ('Grills','Chicken Wings','Smoky peppered wings, 6 pieces',5500,'food'),
 ('Grills','Suya Beef','Yaji-spiced beef skewers',6000,'food'),
 ('Small Chops','Peppered Snail','Sauteed in pepper sauce',7500,'food'),
 ('Small Chops','Asun','Spicy goat meat',7000,'food'),
 ('Small Chops','Plantain','Fried dodo with sauce',3000,'food'),
 ('Mains','Jollof Rice','Party jollof with chicken',6500,'food'),
 ('Mains','Fried Rice','Fried rice with beef',6500,'food'),
 ('Soft Drinks','Coca-Cola','Chilled 50cl',1000,'drink'),
 ('Soft Drinks','Fanta','Chilled 50cl',1000,'drink'),
 ('Soft Drinks','Bottled Water','75cl',800,'drink'),
 ('Cocktails','Chapman','House Chapman',4000,'drink'),
 ('Cocktails','Mojito','Classic mint mojito',5000,'drink'),
 ('Beers','Star Lager','60cl bottle',1800,'drink'),
 ('Beers','Heineken','60cl bottle',2500,'drink')
) AS d(cat,item,descr,price,kind)
JOIN public.menu_categories c ON c.name = d.cat
JOIN public.inventory_items i ON i.name = d.item;