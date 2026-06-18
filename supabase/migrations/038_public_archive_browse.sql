-- Public archive browse (HERO) — additive, reversible foundations.
-- Adds per-event URL slugs + a public-visibility gate so a whole-org album-grid
-- browse can be built WITHOUT touching the stable single-event public routes
-- (public/photos, public/galleries, pill-suggestions, foto-lab/match). Existing
-- queries don't reference these columns, so their behaviour is unchanged.
--
-- NOTE: applied to the live DB out-of-band via `supabase db query --linked`
-- (remote migration history is empty / schema has drifted from this folder, so
-- `supabase db push` is NOT used). This file is the reviewable record.

-- a. Per-event URL slug. organisations.slug already exists; events.slug did not.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- Unique per organisation, ignoring legacy NULLs and soft-deleted rows.
CREATE UNIQUE INDEX IF NOT EXISTS events_org_slug_unique
  ON public.events (organisation_id, slug)
  WHERE slug IS NOT NULL AND deleted_at IS NULL;

-- b. Public-archive visibility gate. DEFAULT false ⇒ nothing is exposed by the
--    new browse endpoints until an event is explicitly curated public.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

-- c. Index for the public album-grid query (only public, live events).
CREATE INDEX IF NOT EXISTS events_public_date_idx
  ON public.events (organisation_id, date DESC)
  WHERE is_public = true AND deleted_at IS NULL;

-- ── Reversal ────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.events_public_date_idx;
-- DROP INDEX IF EXISTS public.events_org_slug_unique;
-- ALTER TABLE public.events DROP COLUMN IF EXISTS is_public;
-- ALTER TABLE public.events DROP COLUMN IF EXISTS slug;
