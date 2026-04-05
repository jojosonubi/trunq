-- Archive-standard filename column
-- Stores the original filename before it was renamed on upload.
-- The renamed (archive-standard) filename lives in the existing `filename` column.

ALTER TABLE public.media_files
  ADD COLUMN IF NOT EXISTS original_filename TEXT DEFAULT NULL;
