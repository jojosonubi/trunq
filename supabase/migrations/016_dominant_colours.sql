-- Store dominant colours extracted from each photo by Claude Vision.
-- Values are canonical colour names from the fixed palette used in the tag prompt
-- (red, orange, yellow, green, teal, blue, purple, pink, white, black, grey, brown).

ALTER TABLE public.media_files
  ADD COLUMN IF NOT EXISTS dominant_colours TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS media_files_dominant_colours_idx
  ON public.media_files USING GIN (dominant_colours);
