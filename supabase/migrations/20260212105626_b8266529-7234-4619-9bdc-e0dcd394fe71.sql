
-- Add empty_since column to track when a room became empty
ALTER TABLE public.rooms ADD COLUMN empty_since timestamp with time zone DEFAULT NULL;
