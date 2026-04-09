-- 025_tagging_queue.sql
-- Adds 'queued' status so the batch API can mark images for background
-- processing before the worker picks them up.

-- Drop existing constraints and recreate with the new 'queued' value
ALTER TABLE public.media_files
  DROP CONSTRAINT IF EXISTS media_files_tagging_status_check,
  DROP CONSTRAINT IF EXISTS media_files_score_status_check;

ALTER TABLE public.media_files
  ADD CONSTRAINT media_files_tagging_status_check
    CHECK (tagging_status IN ('untagged', 'queued', 'processing', 'complete', 'failed')),
  ADD CONSTRAINT media_files_score_status_check
    CHECK (score_status IN ('unscored', 'queued', 'processing', 'complete', 'failed'));
