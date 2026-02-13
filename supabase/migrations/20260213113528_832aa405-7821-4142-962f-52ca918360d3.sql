
-- Add last_message_at to rooms table
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ DEFAULT now();

-- Add expires_at to messages table
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (now() + interval '2 hours');

-- Backfill existing messages
UPDATE public.messages SET expires_at = created_at + interval '2 hours' WHERE expires_at IS NULL;

-- Backfill existing rooms
UPDATE public.rooms SET last_message_at = created_at WHERE last_message_at IS NULL;
