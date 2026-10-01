// Maps a company's free-text `sector` (lib/sectors.ts's SECTORS list,
// 65+ values) onto one of the five hs_sector_packs keys (106) so a new
// client can be auto-seeded with a starter H&S register instead of
// starting empty until a staff member happens to apply a pack by hand.
//
// Conservative by design, the same "never guess" discipline this
// codebase applies to a country/industry match elsewhere (the referral
// gate's KNOWN_COUNTRIES, Manatal's splitLocation never guessing a
// country): only sectors with a genuinely unambiguous physical-risk
// profile are mapped. A sector that could plausibly be office-based OR
// site-based (Engineering, Agriculture, Mining, Education, ...) maps to
// `null` — no pack applied, staff picks by hand — rather than guessing
// and seeding the wrong recurring checks.

// The five hs_sector_packs.sector values seeded by migration 106 —
// kept as a local literal union rather than importing from types.ts,
// since HsSectorPack.sector is plain `string` there (the table has no
// CHECK on it) and this mapping's own five values are the real
// constraint worth typing.
export type HsSectorKey = 'office' | 'construction' | 'manufacturing' | 'care' | 'hospitality';

export const SECTOR_TO_PACK_KEY: Readonly<Record<string, HsSectorKey>> = {
  'Construction':             'construction',
  'Manufacturing':            'manufacturing',
  'Logistics & Supply Chain': 'manufacturing',
  'Healthcare & Medical':     'care',
  'Hospitality & Tourism':    'hospitality',
  'Food & Beverage':          'hospitality',
  'Accounting & Tax':         'office',
  'Architecture':             'office',
  'Banking':                  'office',
  'Charity & Non-Profit':     'office',
  'Consulting':               'office',
  'Creative & Design':        'office',
  'Cybersecurity':            'office',
  'Data & Analytics':         'office',
  'Finance & Investment':     'office',
  'HR & Recruitment':         'office',
  'Insurance':                'office',
  'Legal Services':           'office',
  'Marketing & Advertising':  'office',
  'Media & Publishing':       'office',
  'Professional Services':   'office',
  'Technology & SaaS':        'office',
};

/** `null` means no confident match — never a guessed default. */
export function packSectorKeyForCompanySector(sector: string | null | undefined): HsSectorKey | null {
  if (!sector) return null;
  return SECTOR_TO_PACK_KEY[sector] ?? null;
}
