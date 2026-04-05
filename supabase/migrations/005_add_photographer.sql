-- Add a list of photographers to each event
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS photographers TEXT[] NOT NULL DEFAULT '{}';

-- Add the photographer field to each media file
ALTER TABLE public.media_files
  ADD COLUMN IF NOT EXISTS photographer TEXT;
