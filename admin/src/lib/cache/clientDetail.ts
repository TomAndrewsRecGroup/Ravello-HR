// unstable_cache wrapper for the /clients/[id] page.
//
// All TPO staff see the same client detail (row-level access is gated at
// the sidebar, not the row), so we can cache globally per-id and share
// the result across all staff sessions — no per-user variance.
//
// Uses a service-role Supabase client so the cache function can run
// without request cookies. Cache is tagged with `client:<id>` so any
// admin mutation touching that client can call revalidateTag() to flush.

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

async function fetchClientDetail(id: string): Promise<ClientDetail | null> {
  const sb = serviceClient();
  const [
    { data: company },
    { data: users },
    { data: reqs },
    { data: tickets },
    { count: docsCount },
  ] = await Promise.all([
    sb.from('companies').select('id,name,slug,sector,size_band,contact_email,active,feature_flags,manatal_client_id,account_owner_id,open_days,open_hours,timezone,currency').eq('id', id).single(),
    sb.from('profiles').select('id,email,full_name,role,created_at').eq('company_id', id).order('created_at'),
    sb.from('requisitions').select('id,title,department,seniority,stage,salary_range,location,employment_type,friction_score,friction_level,assigned_recruiter,created_at').eq('company_id', id).order('created_at', { ascending: false }),
    sb.from('tickets').select('id,subject,status,priority').eq('company_id', id).neq('status', 'closed'),
    sb.from('documents').select('*', { count: 'exact', head: true }).eq('company_id', id),
  ]);

  if (!company) return null;
  return {
    company,
    users: users ?? [],
    reqs:  reqs  ?? [],
    tickets: tickets ?? [],
    docsCount: docsCount ?? 0,
  };
}

export function getCachedClientDetail(id: string): Promise<ClientDetail | null> {
  return unstable_cache(
    () => fetchClientDetail(id),
    ['client-detail', id],
    { revalidate: 60, tags: [`client:${id}`] },
  )();
}
