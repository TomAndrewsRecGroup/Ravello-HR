// Cache layer for the /clients/[id] page.
//
// Single layer: unstable_cache with a service-role Supabase client.
// All The People System staff see the same client detail (row-level access is gated
// at the sidebar, not per row), so a shared cache keyed by id is safe.
// TTL 5s; invalidated via revalidateTag(`client:<id>`) from
// admin/src/app/actions.ts whenever a mutation touches the client.
//
// 5-second TTL is a deliberate trade-off: keeps the cache useful for
// rapid re-navigation (back-and-forth between tabs is instant) while
// guaranteeing that if a tag-flush is missed by some new mutation
// path, the stale render disappears within a tick. Was 60s before;
// that was long enough to leave admin staring at an empty user list
// after onboarding while waiting for it to refresh.
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
  docsCount:    number;
}

async function fetchFromDb(id: string): Promise<ClientDetail | null> {
  const sb = serviceClient();
  const [
    { data: company },
    { data: users },
    { data: reqs },
    { data: tickets },
    { count: docsCount },
  ] = await Promise.all([
    sb.from('companies').select('id,name,slug,sector,size_band,contact_email,active,feature_flags,manatal_client_id,account_owner_id,open_days,open_hours,timezone,currency,monthly_retainer_pence,subscription_status,stripe_subscription_id,stripe_customer_id,billing_currency').eq('id', id).single(),
    sb.from('profiles').select('id,email,full_name,role,created_at').eq('company_id', id).order('created_at'),
    sb.from('requisitions').select('id,title,department,seniority,stage,salary_range,location,employment_type,friction_score,friction_level,assigned_recruiter,created_at').eq('company_id', id).order('created_at', { ascending: false }),
    sb.from('tickets').select('id,subject,status,priority').eq('company_id', id).neq('status', 'closed'),
    sb.from('documents').select('*', { count: 'exact', head: true }).eq('company_id', id),
  ]);

  if (!company) return null;
  return {
    company,
    users:   users   ?? [],
    reqs:    reqs    ?? [],
    tickets: tickets ?? [],
    docsCount: docsCount ?? 0,
  };
}

export function getCachedClientDetail(id: string): Promise<ClientDetail | null> {
  return unstable_cache(
    () => fetchFromDb(id),
    ['client-detail', id],
    { revalidate: 5, tags: [`client:${id}`] },
  )();
}
