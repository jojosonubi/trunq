-- ── Brands: logos/sponsors to detect across event photos ────────────────────

CREATE TABLE IF NOT EXISTS public.brands (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id               UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name                   TEXT        NOT NULL CHECK (char_length(trim(name)) > 0),
  reference_url          TEXT,         -- public URL of the uploaded logo image
  reference_storage_path TEXT,         -- for cleanup on delete
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brands_event_id_idx
  ON public.brands (event_id);

-- ── Brand tags: which photos feature a brand's logo ──────────────────────────

CREATE TABLE IF NOT EXISTS public.brand_tags (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  media_file_id  UUID        NOT NULL REFERENCES public.media_files(id) ON DELETE CASCADE,
  brand_id       UUID        NOT NULL REFERENCES public.brands(id)       ON DELETE CASCADE,
  confidence     FLOAT       NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (media_file_id, brand_id)
);

CREATE INDEX IF NOT EXISTS brand_tags_media_file_idx ON public.brand_tags (media_file_id);
CREATE INDEX IF NOT EXISTS brand_tags_brand_idx      ON public.brand_tags (brand_id);

-- ── Track brand-scan status independently from face-scan ─────────────────────

ALTER TABLE public.media_files
  ADD COLUMN IF NOT EXISTS brand_scanned BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS media_files_brand_unscanned_idx
  ON public.media_files (event_id, brand_scanned)
  WHERE brand_scanned = false;

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.brands     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brands: full access for authenticated"
  ON public.brands FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "brand_tags: full access for authenticated"
  ON public.brand_tags FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
