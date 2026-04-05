-- Events table
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  date DATE NOT NULL,
  location TEXT,
  description TEXT,
  cover_image_url TEXT,
  media_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Media files table
CREATE TABLE IF NOT EXISTS public.media_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('image', 'video', 'graphic')),
  file_size BIGINT NOT NULL,
  width INTEGER,
  height INTEGER,
  exif_date_taken TIMESTAMPTZ,
  exif_gps_lat DOUBLE PRECISION,
  exif_gps_lng DOUBLE PRECISION,
  exif_camera_make TEXT,
  exif_camera_model TEXT,
  exif_iso INTEGER,
  exif_aperture DOUBLE PRECISION,
  exif_shutter_speed TEXT,
  exif_focal_length DOUBLE PRECISION,
  quality_score DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tags table
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_file_id UUID NOT NULL REFERENCES public.media_files(id) ON DELETE CASCADE,
  tag_type TEXT NOT NULL CHECK (tag_type IN ('scene', 'mood', 'subject', 'colour', 'ai_generated', 'manual')),
  value TEXT NOT NULL,
  confidence DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-increment media_count on events
CREATE OR REPLACE FUNCTION increment_media_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.events SET media_count = media_count + 1 WHERE id = NEW.event_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_increment_media_count
  AFTER INSERT ON public.media_files
  FOR EACH ROW EXECUTE FUNCTION increment_media_count();

-- Decrement on delete
CREATE OR REPLACE FUNCTION decrement_media_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.events SET media_count = GREATEST(media_count - 1, 0) WHERE id = OLD.event_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_decrement_media_count
  AFTER DELETE ON public.media_files
  FOR EACH ROW EXECUTE FUNCTION decrement_media_count();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_media_files_event_id ON public.media_files(event_id);
CREATE INDEX IF NOT EXISTS idx_tags_media_file_id ON public.tags(media_file_id);
CREATE INDEX IF NOT EXISTS idx_media_files_created_at ON public.media_files(created_at DESC);

-- RLS (Row Level Security) — enable but keep open for now (auth to be added later)
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

-- Permissive policies for now (tighten when auth is added)
CREATE POLICY "Allow all on events" ON public.events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on media_files" ON public.media_files FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on tags" ON public.tags FOR ALL USING (true) WITH CHECK (true);
