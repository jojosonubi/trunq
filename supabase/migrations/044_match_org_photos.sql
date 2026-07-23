-- Internal semantic search: org-scoped nearest-neighbour lookup.
--
-- Sibling of match_archive_photos (migration 042) but WITHOUT the is_public /
-- approved filters — trunq's own /search sees all of the caller's org photos,
-- not just the public archive. Org scoping is enforced at the app layer
-- (requireApiUserWithOrg passes the caller's own org); execute is restricted to
-- service_role. Additive: new function only.

create or replace function public.match_org_photos(
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
  where pe.organisation_id = p_org
    and m.organisation_id = p_org
    and m.deleted_at is null
    and m.file_type = 'image'
  order by pe.embedding <=> p_embedding
  limit least(greatest(p_limit, 1), 500)
$$;

revoke all on function public.match_org_photos(uuid, vector, int) from public, anon, authenticated;
grant execute on function public.match_org_photos(uuid, vector, int) to service_role;

-- Reversal:
-- drop function if exists public.match_org_photos(uuid, vector, int);
