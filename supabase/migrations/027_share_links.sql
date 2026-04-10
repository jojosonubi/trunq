-- Share link system: gated access with per-image review flow

-- ── Core share links ─────────────────────────────────────────────────────────

create table if not exists share_links (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id) on delete cascade,
  folder_id        uuid references folders(id) on delete cascade,
  password_hash    text not null,
  expires_at       timestamptz,
  created_by       uuid references auth.users(id) on delete set null,
  is_active        boolean not null default true,
  show_watermark   boolean not null default false,
  label            text,
  created_at       timestamptz not null default now()
);

-- ── Per-link email allowlist (if set, only these emails get write access) ────

create table if not exists share_link_allowlist (
  id             uuid primary key default gen_random_uuid(),
  share_link_id  uuid not null references share_links(id) on delete cascade,
  email          text not null,
  constraint share_link_allowlist_unique unique (share_link_id, email)
);

-- ── Recipient sessions ────────────────────────────────────────────────────────

create table if not exists share_link_sessions (
  id              uuid primary key default gen_random_uuid(),
  share_link_id   uuid not null references share_links(id) on delete cascade,
  session_token   text not null unique default encode(gen_random_bytes(32), 'hex'),
  email           text,
  has_write_access boolean not null default false,
  ip_address      text,
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now()
);

-- ── Per-image reviews ─────────────────────────────────────────────────────────

create table if not exists image_reviews (
  id              uuid primary key default gen_random_uuid(),
  media_id        uuid not null references media_files(id) on delete cascade,
  share_link_id   uuid not null references share_links(id) on delete cascade,
  reviewer_email  text,
  status          text not null check (status in ('approved', 'rejected', 'pending')),
  comment         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint image_reviews_unique unique (media_id, share_link_id, reviewer_email)
);

-- ── Rate limiting (brute-force protection) ────────────────────────────────────

create table if not exists share_link_attempts (
  id             uuid primary key default gen_random_uuid(),
  share_link_id  uuid not null references share_links(id) on delete cascade,
  ip_address     text not null,
  attempted_at   timestamptz not null default now()
);

-- Index for fast rate-limit lookups
create index if not exists share_link_attempts_ip_time
  on share_link_attempts (share_link_id, ip_address, attempted_at);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table share_links         enable row level security;
alter table share_link_allowlist enable row level security;
alter table share_link_sessions  enable row level security;
alter table image_reviews        enable row level security;
alter table share_link_attempts  enable row level security;

-- Authenticated users can manage share links they created
create policy "owner_manage_share_links" on share_links
  for all to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- Service role has full access (used by API routes)
create policy "service_all_share_links" on share_links
  for all to service_role using (true) with check (true);

create policy "service_all_allowlist" on share_link_allowlist
  for all to service_role using (true) with check (true);

create policy "service_all_sessions" on share_link_sessions
  for all to service_role using (true) with check (true);

create policy "service_all_reviews" on image_reviews
  for all to service_role using (true) with check (true);

create policy "service_all_attempts" on share_link_attempts
  for all to service_role using (true) with check (true);
