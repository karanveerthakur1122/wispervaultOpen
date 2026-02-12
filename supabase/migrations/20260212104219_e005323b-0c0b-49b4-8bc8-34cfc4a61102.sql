-- Add delete_at column to media_views for scheduled cleanup
ALTER TABLE public.media_views 
ADD COLUMN IF NOT EXISTS delete_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 hours');