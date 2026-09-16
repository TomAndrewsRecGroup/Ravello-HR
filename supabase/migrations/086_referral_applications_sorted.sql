-- The /referrals table paginated at 100 rows via `.range()`, and its
-- click-to-sort column headers sorted only the CURRENT PAGE'S rows in
-- the browser. On a 4,700+-row book that meant "sort by score" showed
-- the top score on whichever page you happened to be viewing, not the
-- top score in the whole book — indistinguishable from a working sort
-- until you actually needed the real answer.
--
-- PostgREST cannot sort a top-level resource by a JOINED table's column
-- at all (`.order(col, { referencedTable })` only reorders a NESTED
-- one-to-many array — see postgrest-js's own doc comment: "Ordering
-- with referencedTable doesn't affect the ordering of the parent
-- table"). Candidate name and role title both live on the joined
-- tables, so client-name and role-title sort could never move server-
-- side through a plain `.select()`/`.order()` call. This RPC does the
-- real SQL JOIN + ORDER BY, sorting and filtering across the WHOLE
-- book before paging, with the exact total returned in the same call
-- via `count(*) OVER()` — one round trip, not a second count query.
--
-- SECURITY INVOKER (the default) is deliberate: the admin app reads
-- this through the anon-key session client (createServerSupabaseClient),
-- the same one a plain `.select()` on these three tables already uses
-- and already passes RLS for staff. A SECURITY DEFINER function here
-- would silently widen who can read what through this one path.

CREATE OR REPLACE FUNCTION public.referral_applications_sorted(
  p_sort           text    DEFAULT 'created_at',
  p_dir            text    DEFAULT 'desc',
  p_status         text    DEFAULT NULL,
  p_requisition_id uuid    DEFAULT NULL,
  p_limit          integer DEFAULT 100,
  p_offset         integer DEFAULT 0
)
RETURNS TABLE (
  id                   uuid,
  status               text,
  match_score          integer,
  scan_source          text,
  country_detected     text,
  country_gate_result  text,
  failed_criteria      jsonb,
  matched_skills       jsonb,
  strengths            jsonb,
  gaps                 jsonb,
  scan_error           text,
  scanned_at           timestamptz,
  email_sent_at        timestamptz,
  created_at           timestamptz,
  manatal_candidate_id text,
  candidate_id         uuid,
  candidate_full_name  text,
  candidate_email      text,
  requisition_id       uuid,
  requisition_title    text,
  total_count          bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    ra.id, ra.status, ra.match_score, ra.scan_source, ra.country_detected,
    ra.country_gate_result, ra.failed_criteria, ra.matched_skills, ra.strengths,
    ra.gaps, ra.scan_error, ra.scanned_at, ra.email_sent_at, ra.created_at,
    ra.manatal_candidate_id,
    c.id, c.full_name, c.email,
    r.id, r.title,
    count(*) OVER() AS total_count
  FROM public.referral_applications ra
  -- candidate_id / requisition_id are both NOT NULL on this table
  -- (verified live 2026-09-16), so an inner join drops nothing.
  JOIN public.candidates   c ON c.id = ra.candidate_id
  JOIN public.requisitions r ON r.id = ra.requisition_id
  WHERE (p_status IS NULL OR ra.status = p_status)
    AND (p_requisition_id IS NULL OR ra.requisition_id = p_requisition_id)
  -- Exactly one of each ASC/DESC pair is non-null per (p_sort, p_dir);
  -- every other row in that pair evaluates NULL for every row and so
  -- cannot affect ordering. An unrecognised p_sort (or the 'created_at'
  -- default, which has no pair of its own) falls straight through to
  -- the tie-break below — never an error, never a silent no-op sort.
  -- A missing score/location is an ABSENCE, not a low value, so both
  -- directions push it to the bottom (NULLS LAST) rather than having
  -- "ascending" surface every unscored row first.
  ORDER BY
    CASE WHEN p_sort = 'candidate' AND p_dir = 'asc'  THEN c.full_name END ASC,
    CASE WHEN p_sort = 'candidate' AND p_dir = 'desc' THEN c.full_name END DESC,
    CASE WHEN p_sort = 'role'      AND p_dir = 'asc'  THEN r.title END ASC,
    CASE WHEN p_sort = 'role'      AND p_dir = 'desc' THEN r.title END DESC,
    CASE WHEN p_sort = 'score'     AND p_dir = 'asc'  THEN ra.match_score END ASC NULLS LAST,
    CASE WHEN p_sort = 'score'     AND p_dir = 'desc' THEN ra.match_score END DESC NULLS LAST,
    CASE WHEN p_sort = 'location'  AND p_dir = 'asc'  THEN ra.country_detected END ASC NULLS LAST,
    CASE WHEN p_sort = 'location'  AND p_dir = 'desc' THEN ra.country_detected END DESC NULLS LAST,
    CASE WHEN p_sort = 'status'    AND p_dir = 'asc'  THEN ra.status END ASC,
    CASE WHEN p_sort = 'status'    AND p_dir = 'desc' THEN ra.status END DESC,
    -- Default order, and the tie-break for every other sort — `id` so
    -- a page boundary never drops or duplicates a row sharing a
    -- `created_at` instant (a batch scan can insert several at once).
    ra.created_at DESC,
    ra.id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 500)
  OFFSET GREATEST(p_offset, 0);
$$;

COMMENT ON FUNCTION public.referral_applications_sorted IS
  'Book-wide sort/filter/page for the /referrals table. PostgREST cannot order a top-level resource by a joined column, so client-name and role-title sort could only ever have sorted the current page without this.';
