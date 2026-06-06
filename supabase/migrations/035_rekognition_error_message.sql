ALTER TABLE media_files
ADD COLUMN IF NOT EXISTS rekognition_error_message text;

COMMENT ON COLUMN media_files.rekognition_error_message IS
  'Last error message from Rekognition indexing. Set on status=failed, cleared on re-queue. Used for failure triage.';
