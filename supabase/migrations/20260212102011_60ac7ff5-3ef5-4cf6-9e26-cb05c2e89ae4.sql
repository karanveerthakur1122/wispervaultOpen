
-- Add password_hash column to rooms table for access control
ALTER TABLE public.rooms ADD COLUMN password_hash text;
