-- Add venue to events (specific place name, separate from city/location)

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS venue TEXT;
