-- Adds profile pictures to databases created before avatar_image was in schema.sql.
ALTER TABLE users ADD COLUMN avatar_image TEXT;
