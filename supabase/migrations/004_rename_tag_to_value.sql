-- Rename the 'tag' column to 'value' on the tags table
-- to match the intended schema (migration 001) and application code.
-- The table was created manually with 'tag' instead of 'value'.

ALTER TABLE public.tags RENAME COLUMN tag TO value;
