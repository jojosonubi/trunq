-- ============================================================================
-- Migration 031: UNIQUE (event_id, name) on folders
-- ============================================================================
--
-- Migration 030 collapsed all "Day N · Photographer" folders into plain "Day N"
-- and confirmed 0 duplicates remain. This migration locks that cleanliness in
-- at the schema level so accidental double-submits can't pollute it again.
--
-- Pre-check: abort if any duplicates still exist (belt-and-braces).
-- ============================================================================

DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT event_id, name
    FROM folders
    GROUP BY event_id, name
    HAVING COUNT(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'Migration 031 aborted: % duplicate (event_id, name) combo(s) exist in folders. '
      'Run migration 030 first to collapse them.', dup_count;
  END IF;

  RAISE NOTICE 'Pre-check passed: 0 duplicate (event_id, name) combos in folders';
END $$;

ALTER TABLE public.folders
  ADD CONSTRAINT folders_event_id_name_unique UNIQUE (event_id, name);
