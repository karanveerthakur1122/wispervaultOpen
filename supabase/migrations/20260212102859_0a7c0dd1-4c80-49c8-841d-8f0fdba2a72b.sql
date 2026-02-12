
-- Create a view that excludes password_hash for client use
-- But we can't restrict column access via RLS directly.
-- Instead, create a security definer function for password verification
-- and rely on the edge function for password checks.

-- Create a function to verify room passwords (used by edge function as backup)
CREATE OR REPLACE FUNCTION public.verify_room_password(p_room_id text, p_password_hash text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM rooms
    WHERE room_id = p_room_id
    AND active = true
    AND (password_hash IS NULL OR password_hash = p_password_hash)
  );
$$;
