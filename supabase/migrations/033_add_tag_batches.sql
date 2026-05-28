CREATE TABLE IF NOT EXISTS tag_batches (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  anthropic_batch_id TEXT        NOT NULL UNIQUE,
  organisation_id    UUID        NOT NULL,
  event_id           UUID        NULL,
  status             TEXT        NOT NULL DEFAULT 'submitted'
                                 CONSTRAINT tag_batches_status_check
                                 CHECK (status IN ('submitted', 'complete', 'failed')),
  total_count        INT         NOT NULL,
  succeeded_count    INT         NULL,
  failed_count       INT         NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS tag_batches_status_idx ON tag_batches (status);
CREATE INDEX IF NOT EXISTS tag_batches_org_idx    ON tag_batches (organisation_id);
