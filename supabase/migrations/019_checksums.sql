-- SHA-256 checksum column for integrity verification.

ALTER TABLE public.media_files
  ADD COLUMN IF NOT EXISTS file_hash TEXT DEFAULT NULL;

-- Index for efficient lookups when scanning for files that need verification.
CREATE INDEX IF NOT EXISTS media_files_file_hash_idx
  ON public.media_files (file_hash)
  WHERE file_hash IS NOT NULL;
