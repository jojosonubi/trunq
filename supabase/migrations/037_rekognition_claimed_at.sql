ALTER TABLE media_files
ADD COLUMN IF NOT EXISTS rekognition_claimed_at timestamptz;

COMMENT ON COLUMN media_files.rekognition_claimed_at IS
  'When the indexing pipeline claimed this row (status=processing). Cleared on re-queue. Stuck-row recovery re-queues processing rows claimed more than 10 minutes ago.';
