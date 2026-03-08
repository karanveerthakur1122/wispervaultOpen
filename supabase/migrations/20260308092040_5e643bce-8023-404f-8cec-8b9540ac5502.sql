
-- Enable pg_cron and pg_net extensions for scheduled cleanup
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create room_sessions table for server-side sender validation
CREATE TABLE IF NOT EXISTS public.room_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id text NOT NULL REFERENCES public.rooms(room_id) ON DELETE CASCADE,
  username text NOT NULL,
  session_token uuid NOT NULL DEFAULT gen_random_uuid(),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(room_id, username)
);

-- Enable RLS on room_sessions
ALTER TABLE public.room_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies for room_sessions
CREATE POLICY "Anyone can insert sessions" ON public.room_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read sessions" ON public.room_sessions FOR SELECT USING (true);
CREATE POLICY "Anyone can delete sessions" ON public.room_sessions FOR DELETE USING (true);
CREATE POLICY "Anyone can update sessions" ON public.room_sessions FOR UPDATE USING (true);
