-- "Visually similar" recommendations: nearest neighbours of an EXISTING photo,
-- using its already-stored embedding (no re-embedding needed).
--
-- Org-scoped, excludes the source photo, non-deleted images only. Sibling of
-- match_org_photos (044) but keyed by media_file_id instead of a query vector.
-- security invoker; execute restricted to service_role. Additive.

create or replace function public.match_similar_photos(
  p_media_file_id uuid,
  p_org           uuid,
  p_limit         int default 12
)
returns table (media_file_id uuid, similarity real)
language sql
stable
security invoker
set search_path = public
as $$
  select pe.media_file_id,
         (1 - (pe.embedding <=> src.embedding))::real as similarity
  from public.photo_embeddings src
  join public.photo_embeddings pe on pe.media_file_id <> src.media_file_id
  join public.media_files m on m.id = pe.media_file_id
  where src.media_file_id = p_media_file_id
    and pe.organisation_id = p_org
    and m.organisation_id = p_org
    and m.deleted_at is null
    and m.file_type = 'image'
  order by pe.embedding <=> src.embedding
  limit least(greatest(p_limit, 1), 100)
$$;

revoke all on function public.match_similar_photos(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.match_similar_photos(uuid, uuid, int) to service_role;

-- Reversal:
-- drop function if exists public.match_similar_photos(uuid, uuid, int);
