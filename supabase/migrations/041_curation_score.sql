-- Curation scoring (curatorial rubric v2 — taste-based, distinct from the
-- energy-based quality_score). Written by scripts/curation-rescore.mjs;
-- curation_rank is filled by the per-summer comparative pass (step 2).
-- Additive only: quality_score and all existing consumers are untouched.

ALTER TABLE public.media_files
  ADD COLUMN IF NOT EXISTS curation_score    INTEGER,
  ADD COLUMN IF NOT EXISTS curation_strength TEXT,
  ADD COLUMN IF NOT EXISTS curation_flags    TEXT[],
  ADD COLUMN IF NOT EXISTS curation_reason   TEXT,
  ADD COLUMN IF NOT EXISTS curation_rank     INTEGER;

-- Ranking queries read top-N per event set ordered by curation_score.
CREATE INDEX IF NOT EXISTS idx_media_files_curation_score
  ON public.media_files (curation_score DESC)
  WHERE curation_score IS NOT NULL;

-- Rollback:
-- ALTER TABLE public.media_files
--   DROP COLUMN IF EXISTS curation_score, DROP COLUMN IF EXISTS curation_strength,
--   DROP COLUMN IF EXISTS curation_flags, DROP COLUMN IF EXISTS curation_reason,
--   DROP COLUMN IF EXISTS curation_rank;
