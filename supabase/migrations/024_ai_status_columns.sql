-- 024_ai_status_columns.sql
-- Adds tagging_status and score_status to media_files so AI processing
-- can be fully decoupled from the upload pipeline.

ALTER TABLE public.media_files
  ADD COLUMN IF NOT EXISTS tagging_status text NOT NULL DEFAULT 'untagged'
    CHECK (tagging_status IN ('untagged', 'processing', 'complete', 'failed')),
  ADD COLUMN IF NOT EXISTS score_status text NOT NULL DEFAULT 'unscored'
    CHECK (score_status IN ('unscored', 'processing', 'complete', 'failed'));

-- Backfill: images that already have tags are considered fully tagged.
UPDATE public.media_files mf
SET tagging_status = 'complete'
WHERE file_type = 'image'
  AND EXISTS (SELECT 1 FROM public.tags WHERE media_file_id = mf.id);

-- Backfill: images that already have a quality score are considered scored.
UPDATE public.media_files
SET score_status = 'complete'
WHERE file_type = 'image' AND quality_score IS NOT NULL;
