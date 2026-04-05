-- ── Profiles: one row per auth.users ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT        NOT NULL,
  full_name  TEXT,
  role       TEXT        NOT NULL DEFAULT 'photographer'
               CHECK (role IN ('admin', 'producer', 'photographer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Each user can read their own profile
CREATE POLICY "profiles: read own"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Each user can update their own name (role is immutable by the user)
CREATE POLICY "profiles: update own name"
  ON public.profiles FOR UPDATE TO authenticated
  USING  (id = auth.uid())
  WITH CHECK (
    id   = auth.uid()
    -- prevent role escalation: role must remain unchanged
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  );

-- ── Invites ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invites (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  role       TEXT        NOT NULL DEFAULT 'photographer'
               CHECK (role IN ('admin', 'producer', 'photographer')),
  created_by UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  used_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at    TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '48 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- Only service-role (admin API routes) can manage invites — no direct client access
-- (All invite operations go through /api/invites which uses the service role key)

-- ── Trigger: auto-create profile + consume invite on signup ──────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code  TEXT;
  v_role  TEXT := 'photographer';
BEGIN
  v_code := NEW.raw_user_meta_data->>'invite_code';

  IF v_code IS NOT NULL THEN
    -- Resolve role from the invite (if valid and unused)
    SELECT role INTO v_role
    FROM   public.invites
    WHERE  code       = v_code
      AND  used_at    IS NULL
      AND  expires_at > now();

    -- Consume the invite atomically
    UPDATE public.invites
    SET    used_by = NEW.id,
           used_at = now()
    WHERE  code = v_code
      AND  used_at IS NULL;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    COALESCE(v_role, 'photographer')
  );

  RETURN NEW;
END;
$$;

-- Drop + recreate so re-running this migration is idempotent
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Notes ─────────────────────────────────────────────────────────────────────
-- First admin: create via Supabase Auth dashboard, then run:
--   UPDATE public.profiles SET role = 'admin' WHERE email = 'you@example.com';
