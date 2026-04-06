-- Usage rights / licensing fields on media_files
ALTER TABLE public.media_files
  ADD COLUMN IF NOT EXISTS usage_type       TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS usage_expires_at DATE    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS usage_notes      TEXT    DEFAULT NULL;

-- Index for querying by usage_type or expiry
CREATE INDEX IF NOT EXISTS media_files_usage_type_idx
  ON public.media_files (usage_type) WHERE usage_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS media_files_usage_expires_at_idx
  ON public.media_files (usage_expires_at) WHERE usage_expires_at IS NOT NULL;

COMMENT ON COLUMN public.media_files.usage_type IS
  'Licensing type: all_rights | editorial_only | client_use | restricted — NULL means unlicensed/unset';
COMMENT ON COLUMN public.media_files.usage_expires_at IS
  'Date on which usage rights expire; NULL means no expiry set';
COMMENT ON COLUMN public.media_files.usage_notes IS
  'Free-text notes about licensing terms, restrictions, or attribution requirements';
