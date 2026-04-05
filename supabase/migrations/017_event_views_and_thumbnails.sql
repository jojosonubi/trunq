-- ─── Recently-viewed tracking ────────────────────────────────────────────────
-- One row per (user, event) pair; updated in place on each view.

CREATE TABLE IF NOT EXISTS public.event_views (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id    UUID        NOT NULL REFERENCES public.events(id)   ON DELETE CASCADE,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS event_views_user_viewed_idx
  ON public.event_views (user_id, viewed_at DESC);

ALTER TABLE public.event_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_views: users manage their own rows"
  ON public.event_views FOR ALL
  TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── Custom event cover thumbnail ─────────────────────────────────────────────
-- Stores a storage_path from the `media` bucket.
-- NULL = fall back to the first uploaded photo (current behaviour).

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS thumbnail_storage_path TEXT DEFAULT NULL;
