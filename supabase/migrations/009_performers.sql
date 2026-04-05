-- ── Performers: named faces to track across an event ─────────────────────────

CREATE TABLE IF NOT EXISTS public.performers (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id               UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name                   TEXT        NOT NULL CHECK (char_length(trim(name)) > 0),
  role                   TEXT,
  reference_url          TEXT,         -- public URL of the reference face crop/photo
  reference_storage_path TEXT,         -- for cleanup on delete
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS performers_event_id_idx
  ON public.performers (event_id);

-- ── Performer tags: which photos a performer appears in ───────────────────────

CREATE TABLE IF NOT EXISTS public.performer_tags (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  media_file_id  UUID        NOT NULL REFERENCES public.media_files(id) ON DELETE CASCADE,
  performer_id   UUID        NOT NULL REFERENCES public.performers(id)  ON DELETE CASCADE,
  confidence     FLOAT       NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (media_file_id, performer_id)
);

CREATE INDEX IF NOT EXISTS performer_tags_media_file_idx
  ON public.performer_tags (media_file_id);
CREATE INDEX IF NOT EXISTS performer_tags_performer_idx
  ON public.performer_tags (performer_id);

-- ── Track scan status on each media file ──────────────────────────────────────

ALTER TABLE public.media_files
  ADD COLUMN IF NOT EXISTS face_scanned BOOLEAN NOT NULL DEFAULT false;

-- Partial index for efficient "fetch unscanned images" queries
CREATE INDEX IF NOT EXISTS media_files_unscanned_idx
  ON public.media_files (event_id, face_scanned)
  WHERE face_scanned = false;

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.performers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performer_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "performers: full access for authenticated"
  ON public.performers FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "performer_tags: full access for authenticated"
  ON public.performer_tags FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
