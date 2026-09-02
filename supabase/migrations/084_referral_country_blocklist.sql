-- 084: the country gate becomes a BLOCK list.
--
-- Operator decision, 2026-09-02. The allow list was refusing people the
-- operator would want: it can only ever name countries somebody thought
-- of in advance, and every country nobody typed is a rejection. Measured
-- over the 50 applications processed so far on role 7ae62d7d, 9 were
-- refused on country — 7 with a readable country not on the list
-- (Estonia x2, Turkey, Nigeria, Angola, Brazil, Macedonia) and 2 with no
-- location at all.
--
-- The inversion is not mechanical, and this is the important part: an
-- allow list of 17 countries does NOT translate into a block list. Its
-- complement is "every country on earth except these 17", which cannot
-- be enumerated, and writing an empty block list would silently make
-- those 7 rejections into passes.
--
-- So `blocked_countries` is SEEDED FROM THE OBSERVED REJECTIONS: the
-- distinct countries this role has actually refused. That preserves
-- every decision already made, exactly, on the population actually seen,
-- while claiming nothing about countries nobody has applied from. It is
-- one edit in the referral panel to change, and it is meant to be
-- edited — the seed is a starting point with evidence behind it, not a
-- policy.
--
-- The old list is KEPT, renamed, not dropped. It is the only record of
-- what the operator originally chose, and a dropped column cannot be
-- consulted when deciding what to block.

BEGIN;

ALTER TABLE public.referral_role_config
  RENAME COLUMN approved_countries TO approved_countries_legacy;

COMMENT ON COLUMN public.referral_role_config.approved_countries_legacy IS
  'Frozen at migration 084. The pre-block-list ALLOW list. Read by nothing '
  '— kept so the operator can see what the gate used to permit when '
  'deciding what to block. Safe to drop once blocked_countries is settled.';

ALTER TABLE public.referral_role_config
  ADD COLUMN IF NOT EXISTS blocked_countries TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.referral_role_config.blocked_countries IS
  'Countries to refuse. EMPTY MEANS BLOCK NOBODY — unlike the allow list '
  'it replaced, an unconfigured gate here is fully open, which is what a '
  'block list means. An applicant whose location cannot be read is not '
  'blocked (nothing proves they are) but can never auto-send; see '
  'lib/referral/gate.ts.';

-- Seed from what this role has actually refused. Derived from the
-- applications table rather than hardcoded, so it stays true if these
-- rows differ from the ones measured above.
--
-- `country_detected` is Manatal's free-text location ("Lagos, Lagos
-- State, Nigeria"), so the country is its LAST comma-separated segment.
-- Rows with no location at all are excluded: they are the `unknown`
-- case, and unknown is not a country that can be blocked.
UPDATE public.referral_role_config c
SET blocked_countries = sub.countries
FROM (
  SELECT a.requisition_id,
         array_agg(DISTINCT btrim(split_part(a.country_detected, ',',
           array_length(string_to_array(a.country_detected, ','), 1)))) AS countries
  FROM public.referral_applications a
  WHERE a.country_gate_result = 'rejected'
    AND coalesce(btrim(a.country_detected), '') <> ''
  GROUP BY a.requisition_id
) sub
WHERE sub.requisition_id = c.requisition_id
  AND cardinality(c.blocked_countries) = 0;

-- The verdict vocabulary changes with the gate: approved/rejected become
-- clear/blocked, and `unknown` keeps its meaning.
--
-- The old values stay PERMITTED rather than being rewritten. A row
-- recorded 'rejected' means "had a readable country that was not on the
-- allow list" — which is NOT the same fact as "is on the block list",
-- and relabelling it 'blocked' would assert something about those seven
-- people that was never measured. History keeps its own words.
ALTER TABLE public.referral_applications
  DROP CONSTRAINT IF EXISTS referral_applications_country_gate_result_check;

ALTER TABLE public.referral_applications
  ADD CONSTRAINT referral_applications_country_gate_result_check
  CHECK (country_gate_result IN (
    -- current
    'clear', 'blocked', 'unknown',
    -- pre-084, frozen history
    'approved', 'rejected'
  ));

COMMIT;
