-- Atomic per-event sequence counter for archive filenames.
-- The INSERT ... ON CONFLICT DO UPDATE is a single atomic operation in Postgres,
-- so two concurrent uploads cannot receive the same seq number.

CREATE TABLE IF NOT EXISTS public.media_files_seq (
  event_id UUID    PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  last_seq INTEGER NOT NULL DEFAULT 0
);

-- Returns the next sequence number for the given event, atomically.
CREATE OR REPLACE FUNCTION public.next_media_seq(p_event_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_seq INTEGER;
BEGIN
  INSERT INTO public.media_files_seq (event_id, last_seq)
  VALUES (p_event_id, 1)
  ON CONFLICT (event_id)
  DO UPDATE SET last_seq = media_files_seq.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN v_seq;
END;
$$;
