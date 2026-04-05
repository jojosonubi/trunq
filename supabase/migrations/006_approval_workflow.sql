-- ─── Layer 4: Approval workflow ───────────────────────────────────────────────

-- Add review status to every media file (default = pending)
ALTER TABLE public.media_files
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending'
  CONSTRAINT media_files_review_status_check
    CHECK (review_status IN ('pending', 'approved', 'rejected', 'held'));

-- Index for fast status queries (e.g. "all approved files for this event")
CREATE INDEX IF NOT EXISTS media_files_review_status_idx
  ON public.media_files (event_id, review_status);

-- ─── Delivery links ────────────────────────────────────────────────────────────
-- One row per event; the token is the shareable URL slug.

CREATE TABLE IF NOT EXISTS public.delivery_links (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  token      TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_links_token_idx
  ON public.delivery_links (token);

CREATE INDEX IF NOT EXISTS delivery_links_event_id_idx
  ON public.delivery_links (event_id);

-- RLS: anyone can read (needed for the public client portal),
--      only the service role writes (via the API route).
ALTER TABLE public.delivery_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read delivery_links"
  ON public.delivery_links FOR SELECT USING (true);

CREATE POLICY "Service role can insert delivery_links"
  ON public.delivery_links FOR INSERT WITH CHECK (true);
