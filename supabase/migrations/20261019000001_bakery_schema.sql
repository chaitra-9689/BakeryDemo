-- Bakery storefront schema: catalog, customer profiles, orders.

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
create table public.categories (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  slug        text not null unique,
  sort_order  int  not null default 0
);

create table public.products (
  id            bigint generated always as identity primary key,
  category_id   bigint not null references public.categories (id) on delete restrict,
  name          text not null,
  slug          text not null unique,
  description   text not null default '',
  price         numeric(10, 2) not null check (price >= 0),
  image_url     text,
  is_featured   boolean not null default false,
  is_available  boolean not null default true,
  created_at    timestamptz not null default now()
);

create index products_category_id_idx on public.products (category_id);

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  phone       text,
  address     text,
  created_at  timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create type public.order_status as enum ('pending', 'confirmed', 'baking', 'out_for_delivery', 'delivered', 'cancelled');

create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  status            public.order_status not null default 'pending',
  customer_name     text not null,
  phone             text not null,
  delivery_address  text not null,
  notes             text,
  total             numeric(10, 2) not null default 0,
  created_at        timestamptz not null default now()
);

create index orders_user_id_idx on public.orders (user_id, created_at desc);

create table public.order_items (
  id            bigint generated always as identity primary key,
  order_id      uuid   not null references public.orders (id) on delete cascade,
  product_id    bigint references public.products (id) on delete set null,
  product_name  text   not null,
  unit_price    numeric(10, 2) not null,
  quantity      int    not null check (quantity between 1 and 50)
);

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);

-- Orders are created only through this function so prices always come from
-- the products table, never from the browser.
create function public.place_order(
  p_items             jsonb,
  p_customer_name     text,
  p_phone             text,
  p_delivery_address  text,
  p_notes             text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id  uuid := auth.uid();
  v_order_id uuid;
  v_total    numeric(10, 2) := 0;
  v_item     jsonb;
  v_qty      int;
  v_product  public.products%rowtype;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to place an order';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty';
  end if;
  if coalesce(trim(p_customer_name), '') = '' or coalesce(trim(p_phone), '') = ''
     or coalesce(trim(p_delivery_address), '') = '' then
    raise exception 'Name, phone and delivery address are required';
  end if;

  insert into public.orders (user_id, customer_name, phone, delivery_address, notes)
  values (v_user_id, trim(p_customer_name), trim(p_phone), trim(p_delivery_address), nullif(trim(p_notes), ''))
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::int;
    if v_qty is null or v_qty < 1 or v_qty > 50 then
      raise exception 'Invalid quantity';
    end if;

    select * into v_product
    from public.products
    where id = (v_item ->> 'product_id')::bigint and is_available;
    if not found then
      raise exception 'A product in your cart is no longer available';
    end if;

    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity)
    values (v_order_id, v_product.id, v_product.name, v_product.price, v_qty);

    v_total := v_total + v_product.price * v_qty;
  end loop;

  update public.orders set total = v_total where id = v_order_id;
  return v_order_id;
end;
$$;

revoke execute on function public.place_order(jsonb, text, text, text, text) from public, anon;
grant execute on function public.place_order(jsonb, text, text, text, text) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.categories  enable row level security;
alter table public.products    enable row level security;
alter table public.profiles    enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

create policy "Catalog categories are public"
  on public.categories for select to anon, authenticated using (true);

create policy "Catalog products are public"
  on public.products for select to anon, authenticated using (true);

create policy "Users read own profile"
  on public.profiles for select to authenticated using ((select auth.uid()) = id);

create policy "Users update own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "Users read own orders"
  on public.orders for select to authenticated using ((select auth.uid()) = user_id);

create policy "Users read own order items"
  on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));

grant select on public.categories, public.products to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.orders, public.order_items to authenticated;
