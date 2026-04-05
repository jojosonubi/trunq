-- Add AI-generated description column to media_files
ALTER TABLE public.media_files ADD COLUMN IF NOT EXISTS description TEXT;
