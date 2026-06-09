-- VIZEXAPP Supabase cloud setup
-- Run in Supabase Dashboard -> SQL Editor.
-- Supabase stores authentication, client profiles, visible sites, cameras, recordings, events, and app settings.

create extension if not exists pgcrypto;

create or replace function public.is_vizex_admin()
returns boolean
language sql
stable
as $$
  select auth.jwt() ->> 'email' = 'vizexlatvia@gmail.com';
$$;

create or replace function public.role_for_email(email_value text)
returns text
language sql
immutable
as $$
  select case
    when lower(email_value) = 'vizexlatvia@gmail.com' then 'admin'
    else 'client'
  end;
$$;

create table if not exists public.client_email_registry (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null default 'client' check (role in ('client', 'admin')),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.client_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  company text default '',
  contact text default '',
  address text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_workspace_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  camera_profiles jsonb not null default '[]'::jsonb,
  activity_items jsonb not null default '[]'::jsonb,
  grid_layout jsonb not null default '{"active":false,"presetId":"2x2","slots":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text default '',
  status text not null default 'online',
  owner_email text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cameras (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  sort_order integer not null default 0,
  code text not null,
  name text not null,
  location text default '',
  model text default '',
  status text not null default 'Online',
  quality text default '1080p',
  updated_at timestamptz not null default now(),
  unique (site_id, code)
);

create table if not exists public.recordings (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_code text not null,
  camera_name text default '',
  detail text not null,
  recorded_at timestamptz not null default now(),
  length_label text not null default '00:30',
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_code text,
  message text not null,
  event_time timestamptz not null default now(),
  severity text not null default 'info'
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.client_email_registry (user_id, email, role, status, last_login_at)
  values (new.id, lower(new.email), public.role_for_email(new.email), 'active', now())
  on conflict (email) do update set
    user_id = excluded.user_id,
    role = excluded.role,
    status = excluded.status,
    last_login_at = excluded.last_login_at;

  insert into public.client_profiles (user_id, email)
  values (new.id, lower(new.email))
  on conflict (user_id) do update set
    email = excluded.email,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.client_email_registry enable row level security;
alter table public.client_profiles enable row level security;
alter table public.client_workspace_state enable row level security;
alter table public.sites enable row level security;
alter table public.cameras enable row level security;
alter table public.recordings enable row level security;
alter table public.events enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "Users can register their own email" on public.client_email_registry;
create policy "Users can register their own email"
on public.client_email_registry
for insert
to authenticated
with check (auth.uid() = user_id and auth.jwt() ->> 'email' = email);

drop policy if exists "Users can update their own email registry row" on public.client_email_registry;
create policy "Users can update their own email registry row"
on public.client_email_registry
for update
to authenticated
using (auth.uid() = user_id or public.is_vizex_admin())
with check (auth.uid() = user_id or public.is_vizex_admin());

drop policy if exists "Users and admin can read email registry" on public.client_email_registry;
create policy "Users and admin can read email registry"
on public.client_email_registry
for select
to authenticated
using (auth.uid() = user_id or public.is_vizex_admin());

drop policy if exists "Users can manage own profile" on public.client_profiles;
create policy "Users can manage own profile"
on public.client_profiles
for all
to authenticated
using (auth.uid() = user_id or public.is_vizex_admin())
with check (auth.uid() = user_id or public.is_vizex_admin());

drop policy if exists "Users can manage own workspace state" on public.client_workspace_state;
create policy "Users can manage own workspace state"
on public.client_workspace_state
for all
to authenticated
using (auth.uid() = user_id or public.is_vizex_admin())
with check (auth.uid() = user_id or public.is_vizex_admin());

drop policy if exists "Visible sites can be read" on public.sites;
create policy "Visible sites can be read"
on public.sites
for select
to authenticated
using (owner_email is null or owner_email = auth.jwt() ->> 'email' or public.is_vizex_admin());

drop policy if exists "Admin can manage sites" on public.sites;
create policy "Admin can manage sites"
on public.sites
for all
to authenticated
using (public.is_vizex_admin())
with check (public.is_vizex_admin());

drop policy if exists "Visible cameras can be read" on public.cameras;
create policy "Visible cameras can be read"
on public.cameras
for select
to authenticated
using (
  exists (
    select 1 from public.sites
    where sites.id = cameras.site_id
      and (sites.owner_email is null or sites.owner_email = auth.jwt() ->> 'email' or public.is_vizex_admin())
  )
);

drop policy if exists "Admin can manage cameras" on public.cameras;
create policy "Admin can manage cameras"
on public.cameras
for all
to authenticated
using (public.is_vizex_admin())
with check (public.is_vizex_admin());

drop policy if exists "Visible recordings can be read" on public.recordings;
create policy "Visible recordings can be read"
on public.recordings
for select
to authenticated
using (
  exists (
    select 1 from public.sites
    where sites.id = recordings.site_id
      and (sites.owner_email is null or sites.owner_email = auth.jwt() ->> 'email' or public.is_vizex_admin())
  )
);

drop policy if exists "Admin can manage recordings" on public.recordings;
create policy "Admin can manage recordings"
on public.recordings
for all
to authenticated
using (public.is_vizex_admin())
with check (public.is_vizex_admin());

drop policy if exists "Visible events can be read" on public.events;
create policy "Visible events can be read"
on public.events
for select
to authenticated
using (
  exists (
    select 1 from public.sites
    where sites.id = events.site_id
      and (sites.owner_email is null or sites.owner_email = auth.jwt() ->> 'email' or public.is_vizex_admin())
  )
);

drop policy if exists "Admin can manage events" on public.events;
create policy "Admin can manage events"
on public.events
for all
to authenticated
using (public.is_vizex_admin())
with check (public.is_vizex_admin());

drop policy if exists "Authenticated users can read app settings" on public.app_settings;
create policy "Authenticated users can read app settings"
on public.app_settings
for select
to authenticated
using (true);

drop policy if exists "Admin can manage app settings" on public.app_settings;
create policy "Admin can manage app settings"
on public.app_settings
for all
to authenticated
using (public.is_vizex_admin())
with check (public.is_vizex_admin());

grant select, insert, update on public.client_email_registry to authenticated;
grant select, insert, update on public.client_profiles to authenticated;
grant select, insert, update on public.client_workspace_state to authenticated;
grant select on public.sites, public.cameras, public.recordings, public.events, public.app_settings to authenticated;
grant insert, update, delete on public.sites, public.cameras, public.recordings, public.events, public.app_settings to authenticated;

insert into public.sites (id, name, address, status, owner_email, is_default)
values ('11111111-1111-4111-8111-111111111111', 'Brīvības 118', 'Rīga, Brīvības 118', 'online', null, true)
on conflict (id) do update set
  name = excluded.name,
  address = excluded.address,
  status = excluded.status,
  is_default = excluded.is_default,
  updated_at = now();

insert into public.cameras (site_id, sort_order, code, name, location, model, status, quality)
values
  ('11111111-1111-4111-8111-111111111111', 1, 'CAM-01', 'Ieeja', 'Galvenā ieeja', 'VZX-4K Dome', 'Online', '1080p'),
  ('11111111-1111-4111-8111-111111111111', 2, 'CAM-02', 'Recepcija', 'Klientu zona', 'VZX-4K Dome', 'Online', '1080p'),
  ('11111111-1111-4111-8111-111111111111', 3, 'CAM-03', 'Noliktava', 'Aizmugures noliktava', 'VZX Bullet AI', 'Online', '4K'),
  ('11111111-1111-4111-8111-111111111111', 4, 'CAM-04', 'Stāvvieta', 'Āra perimetrs', 'VZX Bullet AI', 'Online', '4K'),
  ('11111111-1111-4111-8111-111111111111', 5, 'CAM-05', 'Birojs', '2. stāva birojs', 'VZX Mini', 'Online', '720p'),
  ('11111111-1111-4111-8111-111111111111', 6, 'CAM-06', 'Tehniskā telpa', 'Serveru zona', 'VZX Mini', 'Uzmanību', '720p'),
  ('11111111-1111-4111-8111-111111111111', 7, 'CAM-07', 'Rampa', 'Piegādes rampa', 'VZX PTZ', 'Online', '1080p'),
  ('11111111-1111-4111-8111-111111111111', 8, 'CAM-08', 'Kase', 'Norēķinu zona', 'VZX-4K Dome', 'Online', '1080p')
on conflict (site_id, code) do update set
  sort_order = excluded.sort_order,
  name = excluded.name,
  location = excluded.location,
  model = excluded.model,
  status = excluded.status,
  quality = excluded.quality,
  updated_at = now();

insert into public.recordings (site_id, camera_code, camera_name, detail, recorded_at, length_label)
values
  ('11111111-1111-4111-8111-111111111111', 'CAM-01', 'Ieeja', 'Kustība pie galvenās ieejas', now() - interval '7 hours', '00:46'),
  ('11111111-1111-4111-8111-111111111111', 'CAM-04', 'Stāvvieta', 'Transporta aktivitāte', now() - interval '5 hours', '02:14'),
  ('11111111-1111-4111-8111-111111111111', 'CAM-03', 'Noliktava', 'Darbinieku kustība zonā', now() - interval '3 hours', '01:08'),
  ('11111111-1111-4111-8111-111111111111', 'CAM-06', 'Tehniskā telpa', 'Īslaicīgs signāla kritums', now() - interval '1 hour', '00:19'),
  ('11111111-1111-4111-8111-111111111111', 'CAM-08', 'Kase', 'AI atzīmēta ikdienas aktivitāte', now() - interval '20 minutes', '03:02');

insert into public.events (site_id, camera_code, message, event_time, severity)
values
  ('11111111-1111-4111-8111-111111111111', 'CAM-01', 'Tiešraide stabila', now() - interval '3 minutes', 'info'),
  ('11111111-1111-4111-8111-111111111111', null, 'AI pārbaude pabeigta', now() - interval '8 minutes', 'info'),
  ('11111111-1111-4111-8111-111111111111', null, 'Arhīvs sinhronizēts', now() - interval '15 minutes', 'info'),
  ('11111111-1111-4111-8111-111111111111', null, 'Klienta piekļuve aktīva', now() - interval '20 minutes', 'info');

insert into public.app_settings (key, value)
values ('project_sync', '{"mode":"supabase","hosting":"vercel","previousHosting":"github-pages"}'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

do $$
begin
  alter publication supabase_realtime add table public.sites;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.cameras;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.recordings;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.events;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.client_profiles;
exception when duplicate_object then null;
end $$;
