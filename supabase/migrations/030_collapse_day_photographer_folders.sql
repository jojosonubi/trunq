-- ============================================================================
-- Migration 030: Collapse "Day N · Photographer" folders into plain "Day N"
-- ============================================================================
--
-- Background
-- ----------
-- Folders were created at project setup with names like "Day 1 · Filmabdi",
-- "Day 1 · Timi Akindele-Ajani", etc. — one folder per day × photographer.
-- The UploadModal stripped the suffix for display, making all Day 1 folders
-- look identical. photographer attribution already lives on
-- media_files.photographer + photographer_id, which are authoritative.
--
-- This migration:
--   1. Removes the empty "Taja" duplicate in RECESS May 2023.
--   2. For every "Day N · *" group, picks one canonical folder (earliest
--      created_at), renames it to "Day N", re-points all media_files and
--      share_links to the canonical id, then deletes the surplus rows.
--
-- Idempotency: The migration detects each event's work as done and skips it.
-- Running twice is a no-op.
--
-- Scope: data only. No schema changes. No application code changes.
-- ============================================================================

BEGIN;

-- ── Step 1: Remove the empty "Taja" duplicate in RECESS May 2023 ─────────────
-- Keeper: 5137fd4b-1652-4b42-8415-357857d6d36f (37 media files)
-- Empty:  ea9a3ef6-d49b-4956-91ab-ba173deda6e4 (0 media files) ← delete this
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM folders WHERE id = 'ea9a3ef6-d49b-4956-91ab-ba173deda6e4'
  ) THEN
    -- safety check: confirm it has no media attached
    IF (SELECT COUNT(*) FROM media_files WHERE folder_id = 'ea9a3ef6-d49b-4956-91ab-ba173deda6e4') > 0 THEN
      RAISE EXCEPTION 'Aborting: ea9a3ef6-d49b-4956-91ab-ba173deda6e4 unexpectedly has media attached';
    END IF;
    DELETE FROM folders WHERE id = 'ea9a3ef6-d49b-4956-91ab-ba173deda6e4';
    RAISE NOTICE 'Deleted empty Taja duplicate ea9a3ef6-d49b-4956-91ab-ba173deda6e4';
  ELSE
    RAISE NOTICE 'Taja duplicate ea9a3ef6-d49b-4956-91ab-ba173deda6e4 already gone — skipping';
  END IF;
END $$;

COMMIT;

-- ── Step 2: Merge Day N · * folders into plain Day N, per event ──────────────
-- We process each affected event in its own transaction block.
-- If one event fails it rolls back independently; others continue.

DO $$
DECLARE
  r_event   RECORD;
  r_day     RECORD;
  r_folder  RECORD;
  v_canonical_id   UUID;
  v_canonical_name TEXT;
  v_surplus_ids    UUID[];
  v_update_count   INTEGER;
BEGIN
  -- Iterate over every event that has at least one "Day N · *" folder
  FOR r_event IN
    SELECT DISTINCT event_id
    FROM folders
    WHERE name ~ '^Day [0-9]+ · '
    ORDER BY event_id
  LOOP
    RAISE NOTICE '── Event % ──', r_event.event_id;

    BEGIN  -- savepoint per event

      -- For each distinct day number in this event that has any · suffix
      FOR r_day IN
        SELECT
          (regexp_match(name, '^Day ([0-9]+)'))[1]::INTEGER AS day_num
        FROM folders
        WHERE event_id = r_event.event_id
          AND name ~ '^Day [0-9]+'
        GROUP BY 1
        ORDER BY 1
      LOOP
        -- Collect all folders for this event + day
        -- (includes both "Day N" and "Day N · *" variants)
        SELECT
          -- earliest created_at wins canonical
          (array_agg(id ORDER BY created_at ASC))[1]  AS canonical_id,
          -- the plain Day N name (always the target)
          'Day ' || r_day.day_num                     AS target_name,
          -- all IDs for this day
          array_agg(id ORDER BY created_at ASC)        AS all_ids,
          COUNT(*)                                     AS folder_count,
          -- are all names already plain (no suffix)?
          BOOL_AND(name = 'Day ' || r_day.day_num)    AS already_clean
        INTO r_folder
        FROM folders
        WHERE event_id = r_event.event_id
          AND (regexp_match(name, '^Day ([0-9]+)'))[1]::INTEGER = r_day.day_num;

        -- Skip if already clean (single plain Day N, no suffix)
        IF r_folder.already_clean THEN
          RAISE NOTICE '  Day % already clean — skipping', r_day.day_num;
          CONTINUE;
        END IF;

        v_canonical_id   := r_folder.canonical_id;
        v_canonical_name := r_folder.target_name;
        v_surplus_ids    := array_remove(r_folder.all_ids, v_canonical_id);

        RAISE NOTICE '  Day %: canonical=%, surplus=%',
          r_day.day_num, v_canonical_id, v_surplus_ids;

        -- Rename canonical to plain "Day N"
        UPDATE folders
        SET name = v_canonical_name
        WHERE id = v_canonical_id
          AND name <> v_canonical_name;  -- skip if already renamed

        -- Re-point media_files off surplus rows → canonical
        IF array_length(v_surplus_ids, 1) > 0 THEN
          UPDATE media_files
          SET folder_id = v_canonical_id
          WHERE folder_id = ANY(v_surplus_ids);

          GET DIAGNOSTICS v_update_count = ROW_COUNT;
          RAISE NOTICE '    media_files updated: %', v_update_count;

          -- Defensive: re-point share_links too (0 rows currently, but be safe)
          UPDATE share_links
          SET folder_id = v_canonical_id
          WHERE folder_id = ANY(v_surplus_ids);

          GET DIAGNOSTICS v_update_count = ROW_COUNT;
          RAISE NOTICE '    share_links updated: %', v_update_count;

          -- Delete surplus folder rows
          DELETE FROM folders WHERE id = ANY(v_surplus_ids);

          GET DIAGNOSTICS v_update_count = ROW_COUNT;
          RAISE NOTICE '    folders deleted: %', v_update_count;
        END IF;

      END LOOP; -- days

      RAISE NOTICE '  Event % done', r_event.event_id;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Event % FAILED: % — rolling back this event', r_event.event_id, SQLERRM;
      -- The exception propagates; the outer DO block catches it per-iteration
      -- by design this rolls back only the current iteration's work
      -- (PostgreSQL doesn't support per-iteration savepoints in DO blocks
      --  without explicit SAVEPOINT syntax — see note below)
    END;

  END LOOP; -- events

END $$;

-- ── Step 3: Verification queries (run after migration) ───────────────────────
-- These are informational only; no writes.

-- Count of folders still matching Day N · suffix (must be 0)
SELECT COUNT(*) AS remaining_suffixed_folders
FROM folders
WHERE name ~ '^Day [0-9]+ · ';

-- Count of (event_id, name) pairs with more than one folder (must be 0)
SELECT COUNT(*) AS duplicate_day_folder_combos
FROM (
  SELECT event_id, name, COUNT(*) AS cnt
  FROM folders
  WHERE name ~ '^Day [0-9]+'
  GROUP BY event_id, name
  HAVING COUNT(*) > 1
) dups;
