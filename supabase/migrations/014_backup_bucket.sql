-- ── 014_backup_bucket.sql ────────────────────────────────────────────────────
-- Creates the media-backup storage bucket and adds a column to media_files
-- to track whether each file has been copied to the backup bucket.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create the media-backup bucket (private, no public URLs).
--    This uses Supabase's internal storage schema.
--    Idempotent: the ON CONFLICT DO NOTHING means re-running is safe.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media-backup',
  'media-backup',
  false,   -- private: no public URLs, service-role access only
  null,    -- no file size limit
  null     -- allow all mime types
)
ON CONFLICT (id) DO NOTHING;

-- 2. Track backup status per file.
--    NULL = not yet backed up (or backup failed).
--    A path value = successfully copied to media-backup bucket.
ALTER TABLE media_files
  ADD COLUMN IF NOT EXISTS backup_storage_path TEXT DEFAULT NULL;

-- 3. Index so "WHERE backup_storage_path IS NULL" queries are fast.
CREATE INDEX IF NOT EXISTS idx_media_files_backup_path
  ON media_files (backup_storage_path)
  WHERE backup_storage_path IS NULL;

-- 4. RLS: only service role can access media-backup.
--    (The bucket is private so anon/authenticated roles cannot read it via
--    the storage API. No additional RLS policies are needed unless you want
--    finer-grained control within the service role.)
