-- Adds tag_type column to tags (was missing from initial migration)
-- and description column to media_files (from migration 002, if not already run)

ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS tag_type TEXT NOT NULL DEFAULT 'ai_generated'
    CHECK (tag_type IN ('scene', 'mood', 'subject', 'colour', 'ai_generated', 'manual'));

ALTER TABLE public.media_files
  ADD COLUMN IF NOT EXISTS description TEXT;
