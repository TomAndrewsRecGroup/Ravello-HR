// Reads the live roles for the Thursday email: Manatal → filter →
// normalise → resolve the client's name (internal only) → newest first.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getManatalOrganizationName, listLiveManatalJobs } from '@/lib/manatal';
import { isLiveJob, normaliseLiveJob, sortRoles, type LiveRole, type ManatalLiveJobRaw } from './format';

export interface LiveRolesResult {
  roles:     LiveRole[];
  truncated: boolean;
  error:     string | null;
}

export type ListJobs = (opts?: { deadline?: number }) => Promise<{
  jobs: Record<string, unknown>[]; truncated: boolean; error: string | null;
}>;
export type LookupOrgName = (id: string) => Promise<string | null>;

export async function loadLiveRoles(
  sb: SupabaseClient,
  now: Date,
  deps: { listJobs?: ListJobs; orgName?: LookupOrgName; deadline?: number } = {},
): Promise<LiveRolesResult> {
  const listJobs = deps.listJobs ?? listLiveManatalJobs;
  const orgName = deps.orgName ?? getManatalOrganizationName;

  const res = await listJobs({ deadline: deps.deadline });
  if (res.error || res.truncated) {
    return { roles: [], truncated: res.truncated, error: res.error ?? 'Manatal returned a partial list' };
  }

  const roles = (res.jobs as unknown as ManatalLiveJobRaw[])
    .filter(j => isLiveJob(j, now))
    .map(normaliseLiveJob);

  // Client names, for Tom's Match me notification only. Our own
  // companies table first (no API call), then Manatal, best-effort.
  const missing = [...new Set(roles.filter(r => !r.clientName && r.organizationId).map(r => r.organizationId!))];
  if (missing.length) {
    const names = new Map<string, string>();
    const { data } = await sb.from('companies').select('name, manatal_client_id').in('manatal_client_id', missing).limit(200);
    for (const c of (data ?? []) as Array<{ name: string; manatal_client_id: string }>) {
      if (c.manatal_client_id && c.name) names.set(String(c.manatal_client_id), c.name);
    }
    for (const id of missing) {
      if (names.has(id)) continue;
      const n = await orgName(id).catch(() => null);
      if (n) names.set(id, n);
    }
    for (const r of roles) if (!r.clientName && r.organizationId) r.clientName = names.get(r.organizationId) ?? null;
  }

  return { roles: sortRoles(roles), truncated: false, error: null };
}
