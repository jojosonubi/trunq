-- Tag facet for public/events (additive). Server-side GROUP BY so the route
-- never sweeps the 373k-row tags table client-side (the public set alone is
-- ~76k tag rows). Uses idx_tags_mfid_type_value (index-only scan, ~100ms).
--
-- Safe by construction: only aggregates APPROVED + live + image rows of
-- IS_PUBLIC, non-deleted events in the given org — so it cannot leak tags for
-- private events even if called directly. Execution is further restricted to
-- service_role (the public/events route's client); anon/authenticated revoked.
-- cultural_dress is excluded; only the 7 surfaced types.
--
-- ADDITIVE: new function only. No table/column/index/policy altered.

create or replace function public.public_event_tag_facets(p_org uuid, p_event_ids uuid[])
returns table (event_id uuid, tag_type text, value text, count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select m.event_id, t.tag_type, t.value, count(*)::bigint
  from public.tags t
  join public.media_files m on m.id = t.media_file_id
  join public.events ev     on ev.id = m.event_id
  where ev.organisation_id = p_org
    and ev.is_public
    and ev.deleted_at is null
    and ev.id = any(p_event_ids)
    and m.organisation_id = p_org
    and m.review_status = 'approved'
    and m.deleted_at is null
    and m.file_type = 'image'
    and t.tag_type in ('scene','subject','mood','garment','accessory','hair','gesture')
  group by m.event_id, t.tag_type, t.value
$$;

revoke all on function public.public_event_tag_facets(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.public_event_tag_facets(uuid, uuid[]) to service_role;

-- Reversal:
-- drop function if exists public.public_event_tag_facets(uuid, uuid[]);
