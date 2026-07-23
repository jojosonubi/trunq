-- Semantic image search: pgvector embeddings (Titan Multimodal G1, 1024-dim).
--
-- One row per embedded image in photo_embeddings; work-queue columns on
-- media_files mirror the tagging_status / rekognition_claimed_at pattern so
-- /api/embed/process (cron) self-heals new uploads with no upload-route change
-- (default 'pending' is claimable, like rekognition's 'unindexed').
--
-- match_archive_photos is safe by construction (same rationale as migration
-- 040): it only returns approved + live + image rows of is_public, non-deleted
-- events in the given org, so it cannot leak private photos even if called
-- directly. Execution restricted to service_role.
--
-- ADDITIVE: new extension/table/function + two new media_files columns.

create extension if not exists vector;

create table if not exists public.photo_embeddings (
  media_file_id   uuid primary key references public.media_files(id) on delete cascade,
  organisation_id uuid not null,
  embedding       vector(1024) not null,
  model           text not null default 'amazon.titan-embed-image-v1',
  created_at      timestamptz not null default now()
);

-- RLS on with no policies → readable/writable by service_role only (posture of 036)
alter table public.photo_embeddings enable row level security;

-- HNSW cosine index. Defaults (m=16, ef_construction=64) are ample at ~25k rows.
create index if not exists idx_photo_embeddings_hnsw
  on public.photo_embeddings using hnsw (embedding vector_cosine_ops);

-- Work-queue columns (mirrors tagging_status + rekognition_claimed_at)
alter table public.media_files
  add column if not exists embedding_status text not null default 'pending'
    check (embedding_status in ('pending','processing','complete','failed')),
  add column if not exists embedding_claimed_at timestamptz;

-- Partial index for the cron claim query
create index if not exists idx_media_files_embedding_queue
  on public.media_files (created_at)
  where embedding_status = 'pending' and file_type = 'image' and deleted_at is null;

-- Top-K cosine neighbours across the public archive, filtered server-side.
create or replace function public.match_archive_photos(
  p_org       uuid,
  p_embedding vector(1024),
  p_limit     int default 200
)
returns table (media_file_id uuid, similarity real)
language sql
stable
security invoker
set search_path = public
as $$
  select pe.media_file_id,
         (1 - (pe.embedding <=> p_embedding))::real as similarity
  from public.photo_embeddings pe
  join public.media_files m on m.id = pe.media_file_id
  join public.events ev     on ev.id = m.event_id
  where pe.organisation_id = p_org
    and ev.organisation_id = p_org
    and ev.is_public
    and ev.deleted_at is null
    and m.review_status = 'approved'
    and m.deleted_at is null
    and m.file_type = 'image'
  order by pe.embedding <=> p_embedding
  limit least(greatest(p_limit, 1), 500)
$$;

revoke all on function public.match_archive_photos(uuid, vector, int) from public, anon, authenticated;
grant execute on function public.match_archive_photos(uuid, vector, int) to service_role;

-- Reversal:
-- drop function if exists public.match_archive_photos(uuid, vector, int);
-- drop index if exists idx_media_files_embedding_queue;
-- alter table public.media_files drop column if exists embedding_status;
-- alter table public.media_files drop column if exists embedding_claimed_at;
-- drop table if exists public.photo_embeddings;
