-- ═══════════════════════════════════════════════════════════
-- Phase 44: Category-count RPC for the public feed
--
-- Replaces the client-side dedupe + count (which had to pull
-- every published row's category over the wire). SECURITY
-- INVOKER so the public read policy on latest_updates still
-- applies — anon can only see categories attached to published
-- rows.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.latest_updates_category_counts()
RETURNS TABLE(category TEXT, count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT category, COUNT(*)::BIGINT AS count
    FROM latest_updates
   WHERE status = 'published'
     AND category IS NOT NULL
   GROUP BY category
   ORDER BY COUNT(*) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.latest_updates_category_counts() TO anon, authenticated;
