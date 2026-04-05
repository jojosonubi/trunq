-- Folders: named buckets scoped to an event

CREATE TABLE IF NOT EXISTS public.folders (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL CHECK (char_length(trim(name)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS folders_event_id_idx
  ON public.folders (event_id);

-- Assign media files to a folder (nullable — NULL = unfiled)
ALTER TABLE public.media_files
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS media_files_folder_id_idx
  ON public.media_files (folder_id);

-- RLS: authenticated users can do everything
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "folders: full access for authenticated"
  ON public.folders FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
