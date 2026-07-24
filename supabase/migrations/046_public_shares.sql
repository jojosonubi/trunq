-- Public share links: an unguessable, no-login URL to view a collection or a
-- project (event) in the archive. Simpler than the password-gated delivery/
-- share_links flow — anyone with the link can view (and download) read-only.
--
-- One active share per (kind, target) is enforced by a partial unique index so
-- "Share" is idempotent. Revoking sets revoked_at (keeps the row for audit).
-- service_role only (public reads go through the API with the service client).

create table if not exists public.public_shares (
  id              uuid        primary key default gen_random_uuid(),
  token           text        not null unique,
  kind            text        not null check (kind in ('collection', 'event')),
  target_id       uuid        not null,
  organisation_id uuid        not null references public.organisations(id) on delete cascade,
  created_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz
);

-- At most one active (non-revoked) share per target.
create unique index if not exists public_shares_active_target_idx
  on public.public_shares (kind, target_id)
  where revoked_at is null;

create index if not exists public_shares_token_idx
  on public.public_shares (token)
  where revoked_at is null;

alter table public.public_shares enable row level security;
-- RLS on, no policies → service_role only (posture of migrations 036/042).

-- Reversal:
-- drop table if exists public.public_shares;
