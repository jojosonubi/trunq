ALTER TABLE photographers
ADD COLUMN instagram_handle text;

COMMENT ON COLUMN photographers.instagram_handle IS 'Instagram username without the @ prefix. Used for crediting photographers in Foto Lab modal.';
