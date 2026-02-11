
-- Add media and pin columns to messages
ALTER TABLE public.messages ADD COLUMN media_url TEXT;
ALTER TABLE public.messages ADD COLUMN media_type TEXT;
ALTER TABLE public.messages ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT false;

-- Reactions table (encrypted reaction data)
CREATE TABLE public.reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES public.rooms(room_id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read reactions" ON public.reactions FOR SELECT USING (true);
CREATE POLICY "Anyone can insert reactions" ON public.reactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete reactions" ON public.reactions FOR DELETE USING (true);

-- Read receipts table
CREATE TABLE public.read_receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES public.rooms(room_id) ON DELETE CASCADE,
  reader_name TEXT NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, reader_name)
);

ALTER TABLE public.read_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read receipts" ON public.read_receipts FOR SELECT USING (true);
CREATE POLICY "Anyone can insert receipts" ON public.read_receipts FOR INSERT WITH CHECK (true);

-- Media views table for auto-delete tracking
CREATE TABLE public.media_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  media_url TEXT NOT NULL,
  room_id TEXT NOT NULL REFERENCES public.rooms(room_id) ON DELETE CASCADE,
  first_viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.media_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read media_views" ON public.media_views FOR SELECT USING (true);
CREATE POLICY "Anyone can insert media_views" ON public.media_views FOR INSERT WITH CHECK (true);

-- Create encrypted-media storage bucket (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('encrypted-media', 'encrypted-media', false);

-- Storage policies
CREATE POLICY "Anyone can upload encrypted media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'encrypted-media');
CREATE POLICY "Anyone can read encrypted media" ON storage.objects FOR SELECT USING (bucket_id = 'encrypted-media');
CREATE POLICY "Anyone can delete encrypted media" ON storage.objects FOR DELETE USING (bucket_id = 'encrypted-media');

-- Enable realtime for reactions and read_receipts
ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.read_receipts;
