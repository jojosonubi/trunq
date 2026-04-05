-- ─── Feature: Star / Favourites ──────────────────────────────────────────────

ALTER TABLE public.media_files
  ADD COLUMN IF NOT EXISTS starred BOOLEAN NOT NULL DEFAULT false;

-- Index for fast "show me all starred files in this event" queries
CREATE INDEX IF NOT EXISTS media_files_starred_idx
  ON public.media_files (event_id, starred)
  WHERE starred = true;
