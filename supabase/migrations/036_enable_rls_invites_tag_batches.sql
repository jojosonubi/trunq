-- Enable RLS on invites and tag_batches.
-- All access to both tables goes through the service role key (bypasses RLS),
-- so no policies are required. Enabling RLS simply closes public anon access.

ALTER TABLE invites    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_batches ENABLE ROW LEVEL SECURITY;
