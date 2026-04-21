// Cache layer for the /clients/[id] page.
//
// Two layers, in order:
//   1. Redis (global, shared across all serverless instances). TTL 60s.
//   2. unstable_cache (per-instance in-memory fallback when Redis isn't
//      configured or is down). TTL 60s with tag invalidation.
//
// On every read we try Redis; on miss we pull from Supabase via the
// service-role client and write through to Redis. All TPO staff see
// the same data (staff-wide access is gated in the sidebar, not per
// row) so a shared cache is safe.
//
// Invalidation path: revalidateTag(`client:<id>`) flushes the
// unstable_cache layer; `redisDel` clears the Redis key. Both are
// wired through admin/src/app/actions.ts so every existing
// revalidateAdminPath caller flushes both layers transparently.

import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { redisGetJSON, redisSetJSON } from './redis';

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

const REDIS_TTL_SECONDS = 60;

function redisKey(id: string): string { return `client-detail:${id}`; }

async function fetchFromDb(id: string): Promise<ClientDetail | null> {
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

// Per-instance fallback used when Redis is unavailable. Tagged so
// revalidateTag(`client:<id>`) flushes it.
function fetchViaUnstableCache(id: string): Promise<ClientDetail | null> {
  return unstable_cache(
    () => fetchFromDb(id),
    ['client-detail', id],
    { revalidate: 60, tags: [`client:${id}`] },
  )();
}

export async function getCachedClientDetail(id: string): Promise<ClientDetail | null> {
  // Layer 1 — Redis (global, all POPs share it)
  const cached = await redisGetJSON<ClientDetail>(redisKey(id));
  if (cached) return cached;

  // Layer 2 — unstable_cache (per-instance) then DB on miss
  const fresh = await fetchViaUnstableCache(id);
  if (fresh) {
    // Write-through to Redis so sibling instances get it on next read.
    // Fire-and-forget — failure should not block the response.
    redisSetJSON(redisKey(id), fresh, REDIS_TTL_SECONDS).catch(() => {});
  }
  return fresh;
}
