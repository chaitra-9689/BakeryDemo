-- Back-office CRM: admin role, customer notes, order status history, and
-- the RLS policies that let admins see and manage everything.

-- ---------------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------------
create table public.admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.admins enable row level security;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create policy "Admins read admin list"
  on public.admins for select to authenticated using ((select public.is_admin()));

grant select on public.admins to authenticated;

-- ---------------------------------------------------------------------------
-- Profiles: keep a copy of the email so the CRM can show it
-- ---------------------------------------------------------------------------
alter table public.profiles add column email text;

update public.profiles p set email = u.email from auth.users u where u.id = p.id;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Customer notes (admin only)
-- ---------------------------------------------------------------------------
create table public.customer_notes (
  id           bigint generated always as identity primary key,
  customer_id  uuid not null references public.profiles (id) on delete cascade,
  author_id    uuid references auth.users (id) on delete set null default auth.uid(),
  body         text not null check (length(trim(body)) > 0),
  created_at   timestamptz not null default now()
);

create index customer_notes_customer_id_idx on public.customer_notes (customer_id, created_at desc);
create index customer_notes_author_id_idx on public.customer_notes (author_id);

alter table public.customer_notes enable row level security;

create policy "Admins manage customer notes"
  on public.customer_notes for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

grant select, insert, delete on public.customer_notes to authenticated;

-- ---------------------------------------------------------------------------
-- Order status history, written by trigger
-- ---------------------------------------------------------------------------
create table public.order_status_history (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  status      public.order_status not null,
  changed_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index order_status_history_order_id_idx on public.order_status_history (order_id, created_at);
create index order_status_history_changed_by_idx on public.order_status_history (changed_by);

alter table public.order_status_history enable row level security;

create function public.log_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_status_history (order_id, status, changed_by)
    values (new.id, new.status, auth.uid());
  end if;
  return new;
end;
$$;

revoke execute on function public.log_order_status() from public, anon, authenticated;

create trigger on_order_status_change
  after insert or update of status on public.orders
  for each row execute function public.log_order_status();

-- Backfill a starting entry for orders placed before this migration.
insert into public.order_status_history (order_id, status, created_at)
select id, status, created_at from public.orders;

create policy "Order history visible to owner and admins"
  on public.order_status_history for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  );

grant select on public.order_status_history to authenticated;

-- ---------------------------------------------------------------------------
-- Admin access to existing tables
-- ---------------------------------------------------------------------------
create policy "Admins read all profiles"
  on public.profiles for select to authenticated using ((select public.is_admin()));

create policy "Admins read all orders"
  on public.orders for select to authenticated using ((select public.is_admin()));

create policy "Admins update orders"
  on public.orders for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Admins read all order items"
  on public.order_items for select to authenticated using ((select public.is_admin()));

create policy "Admins add products"
  on public.products for insert to authenticated with check ((select public.is_admin()));

create policy "Admins edit products"
  on public.products for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Admins may only change an order's status; everything else stays as placed.
grant update (status) on public.orders to authenticated;
grant insert, update on public.products to authenticated;
