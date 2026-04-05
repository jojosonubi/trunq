-- ── 013_soft_delete.sql ──────────────────────────────────────────────────────
-- Adds soft-delete support to events and media_files.
-- Items with deleted_at IS NOT NULL are treated as trashed.
-- pg_cron job auto-purges items trashed for more than 30 days.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add deleted_at column to events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Add deleted_at column to media_files
ALTER TABLE media_files
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Indexes so "WHERE deleted_at IS NULL" scans stay fast
CREATE INDEX IF NOT EXISTS idx_events_deleted_at
  ON events (deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_media_files_deleted_at
  ON media_files (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- 4. Auto-purge function: hard-deletes rows trashed more than 30 days ago.
--    Storage file removal must be done separately (Edge Function or app layer)
--    because pg_cron cannot call Supabase Storage HTTP APIs directly.
CREATE OR REPLACE FUNCTION purge_old_trash()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM media_files
  WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '30 days';

  DELETE FROM events
  WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '30 days';
END;
$$;

-- 5. Schedule the purge to run daily at 03:00 UTC.
--    Requires the pg_cron extension to be enabled in your Supabase project
--    (Database → Extensions → pg_cron).
--    If pg_cron is not enabled, comment this block out and use a Supabase
--    Edge Function with a cron schedule instead.
SELECT cron.schedule(
  'purge-old-trash',           -- job name (idempotent)
  '0 3 * * *',                 -- daily at 03:00 UTC
  'SELECT purge_old_trash();'
);
