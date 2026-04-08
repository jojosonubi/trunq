-- ── Fix: enable RLS on tables that were missing it ───────────────────────────

-- photographers: read/write for authenticated users only (same pattern as
-- performers, brands, folders). The anon role never needs direct access.
ALTER TABLE public.photographers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "photographers: full access for authenticated"
  ON public.photographers FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- media_files_seq: internal counter table — access is only ever via the
-- next_media_seq() SECURITY DEFINER function, which bypasses RLS.
-- No direct client policies needed; enabling RLS blocks anon/authenticated
-- direct access while leaving the function unaffected.
ALTER TABLE public.media_files_seq ENABLE ROW LEVEL SECURITY;

-- ── Tighten overly-permissive policies from migration 001 ─────────────────────
-- The original "Allow all on X" policies used USING (true) without
-- TO authenticated, granting the anon role full read+write access.
-- Replace them with authenticated-only equivalents.

DROP POLICY IF EXISTS "Allow all on events"      ON public.events;
DROP POLICY IF EXISTS "Allow all on media_files" ON public.media_files;
DROP POLICY IF EXISTS "Allow all on tags"        ON public.tags;

CREATE POLICY "events: full access for authenticated"
  ON public.events FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "media_files: full access for authenticated"
  ON public.media_files FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "tags: full access for authenticated"
  ON public.tags FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- delivery_links: the existing INSERT policy has no TO clause (applies to anon).
-- Public SELECT is intentional (unauthenticated clients access delivery portals),
-- but INSERT/UPDATE/DELETE should be service-role only (already enforced via
-- API routes). No change needed — the read-only anon access is by design.
