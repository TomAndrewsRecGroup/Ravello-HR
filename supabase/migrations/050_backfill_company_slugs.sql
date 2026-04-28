-- ════════════════════════════════════════════════════════════════════════
-- Migration 050: Backfill company slugs for legacy rows
-- ────────────────────────────────────────────────────────────────────────
-- The admin client URLs now use the company slug
-- (/clients/<slug>) instead of the UUID. The /clients/[id] route
-- handler still accepts UUIDs and redirects to the slug equivalent —
-- but that fallback only works if every active company actually has
-- a slug.
--
-- New companies get a slug at create time (from /api/admin/clients
-- POST). Older rows may have NULL or empty slugs depending on when
-- they were inserted. This migration fills any gaps with a derived
-- slug from the company name, deduping if the slug collides with an
-- existing one.
--
-- Idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  c RECORD;
  base_slug TEXT;
  candidate TEXT;
  attempt   INT;
BEGIN
  FOR c IN
    SELECT id, name, slug
      FROM companies
     WHERE slug IS NULL OR slug = ''
  LOOP
    -- name → lowercased, alphanum-and-hyphen only, trimmed of edge hyphens
    base_slug := regexp_replace(lower(coalesce(c.name, 'company')), '[^a-z0-9]+', '-', 'g');
    base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
    IF base_slug = '' THEN
      base_slug := 'company-' || substr(c.id::text, 1, 8);
    END IF;

    -- Find a non-colliding slug. Append -2, -3, … if base is taken.
    candidate := base_slug;
    attempt   := 1;
    WHILE EXISTS (SELECT 1 FROM companies WHERE slug = candidate AND id <> c.id) LOOP
      attempt   := attempt + 1;
      candidate := base_slug || '-' || attempt;
    END LOOP;

    UPDATE companies SET slug = candidate WHERE id = c.id;
    RAISE NOTICE 'Backfilled slug % for %', candidate, c.name;
  END LOOP;
END $$;

-- Verify nothing's still missing.
SELECT id, name, slug FROM companies WHERE slug IS NULL OR slug = '';
