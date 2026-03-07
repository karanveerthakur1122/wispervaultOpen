
-- Revoke SELECT on password_hash column from anon and authenticated roles
-- This prevents clients from reading password hashes even though RLS allows row access
REVOKE SELECT (password_hash) ON public.rooms FROM anon;
REVOKE SELECT (password_hash) ON public.rooms FROM authenticated;
