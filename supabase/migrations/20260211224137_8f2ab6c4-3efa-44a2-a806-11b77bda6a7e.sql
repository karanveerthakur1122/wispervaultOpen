
-- Rooms table
CREATE TABLE public.rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  active BOOLEAN NOT NULL DEFAULT true,
  user_count INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read rooms" ON public.rooms FOR SELECT USING (true);
CREATE POLICY "Anyone can create rooms" ON public.rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update rooms" ON public.rooms FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete rooms" ON public.rooms FOR DELETE USING (true);

-- Messages table (only encrypted blobs stored)
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES public.rooms(room_id) ON DELETE CASCADE,
  encrypted_blob TEXT NOT NULL,
  iv TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_color TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read messages" ON public.messages FOR SELECT USING (true);
CREATE POLICY "Anyone can insert messages" ON public.messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update messages" ON public.messages FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete messages" ON public.messages FOR DELETE USING (true);

-- Presence table
CREATE TABLE public.presence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES public.rooms(room_id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  avatar_color TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read presence" ON public.presence FOR SELECT USING (true);
CREATE POLICY "Anyone can insert presence" ON public.presence FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update presence" ON public.presence FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete presence" ON public.presence FOR DELETE USING (true);

-- Unique constraint: no duplicate usernames per room
CREATE UNIQUE INDEX idx_presence_room_username ON public.presence(room_id, username) WHERE is_active = true;

-- Enable realtime for messages and presence
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.presence;
