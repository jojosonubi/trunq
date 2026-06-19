-- Tag filter support (additive) — restore tag indexes lost in the schema drift.
--
-- The live tags table (~373k rows) currently has ONLY tags_pkey(id) and
-- idx_tags_organisation_id. The media_file_id index from migration 001 is gone,
-- so the per-event tag facet (Part 2) and the tag filter (Part 3) — both scoped
-- by media_file_id — fall back to sequential scans (a per-row EXISTS already
-- timed out during diagnosis).
--
-- ADDITIVE: creates ONE new index only. No existing index, column, table,
-- constraint or trigger is altered or dropped. Stable routes (public/photos,
-- public/galleries, pill-suggestions, match) are unaffected — they don't depend
-- on these indexes; the planner merely gains options. Nothing else changes.
--
-- ⚠️ CONCURRENTLY (recommended): so the build never takes a write-blocking lock
--    on a LIVE table that tagging runs insert into. Caveats:
--      • CREATE INDEX CONCURRENTLY CANNOT run inside a transaction block. Apply
--        each statement STANDALONE — do NOT wrap in BEGIN/COMMIT, and ensure the
--        apply path doesn't auto-wrap (run them one at a time if unsure).
--      • Slower than a plain build; on failure it leaves an INVALID index that
--        must be dropped before retrying (the IF NOT EXISTS re-run is safe once
--        any invalid leftover is removed).
--    Plain alternative (ONLY in a quiet window): drop the word CONCURRENTLY —
--    a plain CREATE INDEX briefly SHARE-locks tags, blocking writes for the
--    ~seconds-long build. Fine if no tagging is running; CONCURRENTLY is safer.

-- Single composite index — serves BOTH the facet and the tag filter because
-- both are media_file_id-scoped: a media_file_id lookup (leading column) plus
-- (tag_type, value) for grouping/counting and value matching WITHIN an event's
-- photos, without heap fetches. One index keeps write-amplification on the live
-- tags table minimal. (No standalone media_file_id index — this composite's
-- leading column already serves media_file_id-only lookups. No value-leading
-- index either: the new facet/filter are always event-scoped.)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tags_mfid_type_value
  ON public.tags (media_file_id, tag_type, value);

-- ── Reversal (DROP CONCURRENTLY also cannot run inside a transaction) ─────────
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_tags_mfid_type_value;
