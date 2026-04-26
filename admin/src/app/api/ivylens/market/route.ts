// GET /api/ivylens/market
// Query: ?role_type=<string>&location=<string>&force=<bool>
// Returns derived market salary + friction aggregates from IvyLens /bd/leads.
// IvyLens exposes no single /market endpoint, so we roll our own aggregates.
//
// Auth: tps_admin / tps_client only.
// Cache: 24h TTL, keyed by role_type + location. force=true bypasses.

import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { ivylensRequest, readCache, writeCache } from '@/lib/ivylens';

interface IvylensLead {
  id?:               string;
  company_name?:     string;
  company_location?: string;
  roles?: Array<{
    title?:    string;
    location?: string;
    salary?:   string;
    url?:      string;
    source?:   string;
  }>;
  friction_intel?: {
    signals?: Array<{ signal_type?: string; severity?: string; role_title?: string }>;
    summary?: {
      signal_count?:  number;
      high_repost?:   number;
      long_vacancy?:  number;
      volume_hiring?: number;
    };
  };
}

interface MarketAggregate {
  role_type:       string;
  location:        string | null;
  sample_size:     number;
  salary_p25:      number | null;
  salary_p50:      number | null;
  salary_p75:      number | null;
  salary_p90:      number | null;
  pressure_score:  number;       // 0-100: higher = more market friction
  pressure_band:   'low' | 'moderate' | 'high';
  signal_counts:   { high_repost: number; long_vacancy: number; volume_hiring: number };
}

function parseSalary(s: string | null | undefined): number[] {
  if (!s) return [];
  const matches = s.replace(/[£,]/g, '').match(/(\d+)(k)?/gi) ?? [];
  return matches
    .map(m => {
      const hasK = /k$/i.test(m);
      const v = parseInt(m.replace(/k$/i, ''), 10);
      return hasK ? v * 1000 : v;
    })
    .filter(n => !isNaN(n) && n >= 10_000 && n <= 1_000_000);
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo));
}

function normaliseRoleType(title: string | undefined): string {
  if (!title) return 'other';
  const lower = title.toLowerCase();
  // Coarse buckets: keeps sample sizes meaningful given small daily feed volumes
  if (/(engineer|developer|swe|sde)/.test(lower))   return 'software-engineer';
  if (/(designer|ux|product design)/.test(lower))   return 'product-designer';
  if (/(data|analyst|scientist)/.test(lower))       return 'data';
  if (/(product manager|pm\b|po\b)/.test(lower))    return 'product-manager';
  if (/(marketing|growth|content)/.test(lower))     return 'marketing';
  if (/(sales|account executive|ae\b|bdr|sdr)/.test(lower)) return 'sales';
  if (/(people|hr|talent|recruit)/.test(lower))     return 'hr';
  if (/(devops|sre|platform)/.test(lower))          return 'devops';
  if (/(finance|accountant|controller)/.test(lower)) return 'finance';
  return 'other';
}

function normaliseLocation(loc: string | undefined): string | null {
  if (!loc) return null;
  const lower = loc.toLowerCase();
  if (/remote/.test(lower)) return 'remote';
  if (/london/.test(lower)) return 'london';
  if (/manchester/.test(lower)) return 'manchester';
  if (/edinburgh|glasgow/.test(lower)) return 'scotland';
  if (/birmingham/.test(lower)) return 'birmingham';
  if (/bristol/.test(lower)) return 'bristol';
  if (/united kingdom|uk\b/.test(lower)) return 'uk';
  return lower.split(',')[0].trim();
}

function aggregateMarket(leads: IvylensLead[]): MarketAggregate[] {
  const buckets = new Map<string, { salaries: number[]; signals: { high_repost: number; long_vacancy: number; volume_hiring: number } }>();

  for (const lead of leads) {
    const intel = lead.friction_intel?.summary ?? {};
    for (const role of lead.roles ?? []) {
      const roleType = normaliseRoleType(role.title);
      const loc      = normaliseLocation(role.location ?? lead.company_location);
      const key      = `${roleType}|${loc ?? 'any'}`;

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { salaries: [], signals: { high_repost: 0, long_vacancy: 0, volume_hiring: 0 } };
        buckets.set(key, bucket);
      }
      bucket.salaries.push(...parseSalary(role.salary));
      bucket.signals.high_repost   += intel.high_repost   ?? 0;
      bucket.signals.long_vacancy  += intel.long_vacancy  ?? 0;
      bucket.signals.volume_hiring += intel.volume_hiring ?? 0;
    }
  }

  const results: MarketAggregate[] = [];
  for (const [key, bucket] of buckets) {
    const [role_type, rawLoc] = key.split('|');
    const sorted = [...bucket.salaries].sort((a, b) => a - b);
    const signalTotal = bucket.signals.high_repost + bucket.signals.long_vacancy + bucket.signals.volume_hiring;
    // Pressure: signals per role in the bucket, capped at 100
    const pressure = Math.min(100, Math.round((signalTotal / Math.max(1, bucket.salaries.length)) * 25));
    const band: MarketAggregate['pressure_band'] = pressure >= 60 ? 'high' : pressure >= 30 ? 'moderate' : 'low';

    results.push({
      role_type,
      location:     rawLoc === 'any' ? null : rawLoc,
      sample_size:  bucket.salaries.length,
      salary_p25:   percentile(sorted, 0.25),
      salary_p50:   percentile(sorted, 0.50),
      salary_p75:   percentile(sorted, 0.75),
      salary_p90:   percentile(sorted, 0.90),
      pressure_score: pressure,
      pressure_band:  band,
      signal_counts:  bucket.signals,
    });
  }

  return results.sort((a, b) => b.sample_size - a.sample_size);
}

const CACHE_KEY = 'market:aggregate';
const CACHE_TTL = 24 * 60 * 60; // 24h

export async function GET(request: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const force = request.nextUrl.searchParams.get('force') === 'true';

  if (!force) {
    const cache = await readCache<{ aggregates: MarketAggregate[]; as_of: string }>(CACHE_KEY);
    if (!cache.missing && !cache.stale && cache.payload) {
      return NextResponse.json({ ...cache.payload, cached: true, fetched_at: cache.fetched_at });
    }
  }

  const res = await ivylensRequest<{ leads?: IvylensLead[]; total?: number }>('/bd/leads');

  // Rate-limited or upstream error: fall back to stale cache if we have it
  if (!res.data) {
    const cache = await readCache<{ aggregates: MarketAggregate[]; as_of: string }>(CACHE_KEY);
    if (!cache.missing && cache.payload) {
      return NextResponse.json({
        ...cache.payload,
        cached:       true,
        stale:        true,
        fetched_at:   cache.fetched_at,
        upstream_error: res.error,
      });
    }
    return NextResponse.json({ error: res.error ?? 'IvyLens unavailable' }, { status: res.status || 502 });
  }

  const aggregates = aggregateMarket(res.data.leads ?? []);
  const payload = { aggregates, as_of: new Date().toISOString(), source: 'ivylens' as const };

  await writeCache(CACHE_KEY, payload, CACHE_TTL);

  return NextResponse.json({ ...payload, cached: false });
}
