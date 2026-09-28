import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { effectiveCompanyId } from '@/lib/auth/activeOrganisation';
import type { Capability } from '@/lib/auth/capabilities';

// Everything a PROTECT safety page needs to know about the viewer, in
// one parallel round trip: who they are, the organisation they are
// ACTING in (a consultant works inside a client — never the home
// company), and the capabilities they hold there.
//
// `can()` only decides which buttons to OFFER. Every write is decided by
// RLS and the 122-126 guards, which is why a page never trusts it for
// anything but presentation.

export interface SafetyContext {
  supabase:  SupabaseClient;
  userId:    string | null;
  companyId: string | null;
  can:       (cap: Capability) => boolean;
}

export async function getSafetyContext(): Promise<SafetyContext> {
  const supabase = await createServerSupabaseClient();
  const [{ data: auth }, companyId, capsRes] = await Promise.all([
    supabase.auth.getUser(),
    effectiveCompanyId(supabase),
    supabase.rpc('my_capabilities'),
  ]);
  const caps = new Set<string>(Array.isArray(capsRes.data) ? (capsRes.data as string[]) : []);
  return { supabase, userId: auth.user?.id ?? null, companyId, can: (c) => caps.has(c) };
}

export type { DirectoryPerson } from './safetyFormat';
import type { DirectoryPerson } from './safetyFormat';

/** People who can act in the active organisation (127 org_directory). */
export async function orgDirectory(supabase: SupabaseClient): Promise<DirectoryPerson[]> {
  const { data } = await supabase.rpc('org_directory');
  return ((data ?? []) as DirectoryPerson[]).sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export interface SiteOption { id: string; name: string }
export interface DepartmentOption { id: string; name: string; site_id: string | null }

export async function orgSitesAndDepartments(supabase: SupabaseClient, companyId: string): Promise<{ sites: SiteOption[]; departments: DepartmentOption[] }> {
  const [s, d] = await Promise.all([
    supabase.from('hs_sites').select('id, name').eq('company_id', companyId).order('name').limit(500),
    supabase.from('departments').select('id, name, site_id').eq('company_id', companyId).order('name').limit(500),
  ]);
  return { sites: (s.data ?? []) as SiteOption[], departments: (d.data ?? []) as DepartmentOption[] };
}

// Pure display helpers live in safetyFormat.ts so client components can
// import them without pulling this file's server client into the browser
// bundle (next/headers). Re-exported here for server pages.
export { nameOf, param, fmtDate, fmtDateTime, todayIso } from './safetyFormat';
