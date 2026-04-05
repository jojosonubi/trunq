-- Run this in the Supabase SQL editor after creating your project
-- Creates the 'media' storage bucket

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  true,
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime', 'video/mov']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Public read access" ON storage.objects FOR SELECT USING (bucket_id = 'media');
CREATE POLICY "Authenticated upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'media');
CREATE POLICY "Authenticated update" ON storage.objects FOR UPDATE USING (bucket_id = 'media');
CREATE POLICY "Authenticated delete" ON storage.objects FOR DELETE USING (bucket_id = 'media');
