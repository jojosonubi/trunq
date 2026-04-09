-- Persistent autocomplete tables for venues and locations

create table if not exists venues (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz default now()
);

create unique index if not exists venues_name_ci on venues (lower(name));

create table if not exists locations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz default now()
);

create unique index if not exists locations_name_ci on locations (lower(name));

-- RLS
alter table venues   enable row level security;
alter table locations enable row level security;

create policy "authenticated read venues"   on venues   for select using (auth.role() = 'authenticated');
create policy "authenticated insert venues" on venues   for insert with check (auth.role() = 'authenticated');

create policy "authenticated read locations"   on locations for select using (auth.role() = 'authenticated');
create policy "authenticated insert locations" on locations for insert with check (auth.role() = 'authenticated');
