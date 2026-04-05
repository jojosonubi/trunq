-- Photographer profiles: persistent records so we can show profile pages
-- and autocomplete names across the app.

CREATE TABLE IF NOT EXISTS public.photographers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness (upsert is done on lower(name))
CREATE UNIQUE INDEX IF NOT EXISTS photographers_name_lower_idx
  ON public.photographers (lower(name));
