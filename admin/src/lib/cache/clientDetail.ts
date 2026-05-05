// Cache layer for the /clients/[id] page.
//
// Single layer: unstable_cache with a service-role Supabase client.
// All The People System staff see the same client detail (row-level access is gated
// at the sidebar, not per row), so a shared cache keyed by company id
// is safe.
//
// Two design decisions worth knowing about:
//
// 1. We DON'T cache "not found" results. Caching null swallows
//    transient Supabase failures — a network blip returns
//    `data: null, error: <msg>`, and if we cached that, every visitor
//    for the next 5 seconds saw a 404 on a perfectly good client. We
//    now throw on real errors and only return null when the DB
//    actually says the row doesn't exist.
//
// 2. The cache is keyed by RESOLVED UUID, not by the URL param. A
//    pre-cache slug→uuid lookup adds one short query but means both
//    /clients/<uuid> and /clients/<slug> share a single cache entry,
//    and `revalidateTag(client:<uuid>)` issued by mutation routes
//    flushes the entry no matter which URL form populated it.
//
// A Redis layer previously lived here but was removed because pulling
// node-redis into any module that a 'use server' file imports breaks
// the Next build (flight-action-entry-loader walks the graph and fails
// to resolve net/tls/crypto in the client bundle). The redis helper
// at lib/cache/redis.ts stays dormant; re-wire it behind an API route
// if/when we actually want cross-instance caching.

import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface ClientDetail {
  company:      any;
  users:        any[];
  reqs:         any[];
  tickets:      any[];
  notes:        any[];
  docsCount:    number;
}

// Cheap uncached lookup that turns a slug or UUID into the canonical
// UUID. Returns null only when the row genuinely doesn't exist;
// throws on transient errors so they don't get cached downstream.
async function resolveCompanyId(idOrSlug: string): Promise<string | null> {
  if (UUID_RE.test(idOrSlug)) return idOrSlug;
  const sb = serviceClient();
  const { data, error } = await sb
    .from('companies')
    .select('id')
    .eq('slug', idOrSlug)
    .maybeSingle();
  if (error) throw new Error(`resolveCompanyId failed: ${error.message}`);
  return data?.id ?? null;
}

async function fetchFromDb(companyId: string): Promise<ClientDetail | null> {
  const sb = serviceClient();

  const { data: company, error: companyErr } = await sb
    .from('companies')
    .select('id,name,slug,sector,size_band,contact_email,active,archived_at,logo_url,feature_flags,manatal_client_id,account_owner_id,open_days,open_hours,timezone,currency,monthly_retainer_pence,subscription_status,stripe_subscription_id,stripe_customer_id,billing_currency')
    .eq('id', companyId)
    .maybeSingle();

  if (companyErr) throw new Error(`clientDetail company lookup failed: ${companyErr.message}`);
  if (!company) return null;

  const [
    { data: users,   error: usersErr },
    { data: reqs,    error: reqsErr },
    { data: tickets, error: ticketsErr },
    { data: notes,   error: notesErr },
    { count: docsCount, error: docsErr },
  ] = await Promise.all([
    sb.from('profiles').select('id,email,full_name,role,created_at').eq('company_id', companyId).order('created_at'),
    sb.from('requisitions').select('id,title,department,seniority,stage,salary_range,location,employment_type,friction_score,friction_level,assigned_recruiter,created_at').eq('company_id', companyId).order('created_at', { ascending: false }),
    sb.from('tickets').select('id,subject,status,priority').eq('company_id', companyId).neq('status', 'closed'),
    sb.from('client_notes').select('id,company_id,author_id,note_type,title,body,pinned,created_at,profiles(full_name)').eq('company_id', companyId).order('created_at', { ascending: false }).limit(50),
    sb.from('documents').select('*', { count: 'exact', head: true }).eq('company_id', companyId),
  ]);

  const firstErr = usersErr || reqsErr || ticketsErr || notesErr || docsErr;
  if (firstErr) throw new Error(`clientDetail rollup failed: ${firstErr.message}`);

  return {
    company,
    users:   users   ?? [],
    reqs:    reqs    ?? [],
    tickets: tickets ?? [],
    notes:   notes   ?? [],
    docsCount: docsCount ?? 0,
  };
}

class ClientNotFoundError extends Error {
  constructor() { super('client not found'); this.name = 'ClientNotFoundError'; }
}

export async function getCachedClientDetail(idOrSlug: string): Promise<ClientDetail | null> {
  // Resolve to UUID first so the cache key + tag are consistent
  // regardless of which URL form the user arrived through.
  const companyId = await resolveCompanyId(idOrSlug);
  if (!companyId) return null;

  return unstable_cache(
    async () => {
      const result = await fetchFromDb(companyId);
      // Throwing skips the cache write; the catch below translates
      // it back into a null return.
      if (!result) throw new ClientNotFoundError();
      return result;
    },
    ['client-detail', companyId],
    { revalidate: 5, tags: [`client:${companyId}`] },
  )().catch(err => {
    if (err instanceof ClientNotFoundError) return null;
    throw err;
  });
}
