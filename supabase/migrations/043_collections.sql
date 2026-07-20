-- Collections: cross-event curated photo sets (e.g. picks saved from search).
-- Unlike folders (single-event, media_files.folder_id), collections are
-- org-scoped and many-to-many so one photo can live in several collections.
--
-- ADDITIVE: two new tables, no changes to existing tables.

CREATE TABLE IF NOT EXISTS public.collections (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL CHECK (char_length(trim(name)) > 0),
  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS collections_org_idx
  ON public.collections (organisation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.collection_items (
  collection_id UUID        NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  media_file_id UUID        NOT NULL REFERENCES public.media_files(id) ON DELETE CASCADE,
  added_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, media_file_id)
);

CREATE INDEX IF NOT EXISTS collection_items_media_idx
  ON public.collection_items (media_file_id);

-- RLS posture matches folders (008): any authenticated app user has full access.
ALTER TABLE public.collections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "collections: full access for authenticated"
  ON public.collections FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "collection_items: full access for authenticated"
  ON public.collection_items FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Reversal:
-- DROP TABLE IF EXISTS public.collection_items;
-- DROP TABLE IF EXISTS public.collections;
