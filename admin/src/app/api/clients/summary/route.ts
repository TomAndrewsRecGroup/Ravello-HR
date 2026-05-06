// GET /api/clients/summary
// Returns the aggregated data the /clients list page needs in a single
// JSON payload. Served with Cache-Control: s-maxage=30 +
// stale-while-revalidate=300 so second browser loads render instantly
// from HTTP cache while a background refetch fills in fresh data.
//
// Auth: tps_admin only.

import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/requireStaff';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET() {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const sb = serviceClient();

  const [
    { data: companies },
    { data: reqs },
    { data: tickets },
    { data: complianceItems },
    { data: profiles },
  ] = await Promise.all([
    // Archive filter removed at the query level: when migration 058
    // hasn't been applied yet, the column doesn't exist and the
    // .is('archived_at', null) clause was failing the whole select,
    // leaving /clients silently empty. The page can hide archived
    // clients client-side once the column is selected (post-058
    // deploys can re-add 'archived_at' to the SELECT and filter
    // c.archived_at in the UI).
    sb.from('companies').select('id,name,slug,sector,size_band,contact_email,active,logo_url,feature_flags,account_owner_id,friction_band,monthly_retainer_pence,subscription_status,billing_currency').order('name').limit(200),
    sb.from('requisitions').select('company_id,stage').neq('stage', 'filled').neq('stage', 'cancelled').limit(200),
    sb.from('tickets').select('company_id,status').in('status', ['open', 'in_progress']).limit(200),
    sb.from('compliance_items').select('company_id,status,due_date').neq('status', 'complete').limit(200),
    sb.from('profiles').select('id,full_name,email,role,created_at,company_id').in('role', ['client_admin', 'client_editor']).limit(200),
  ]);

  const activeRolesMap: Record<string, number> = {};
  const openTicketsMap: Record<string, number> = {};
  const overdueCompMap: Record<string, number> = {};
  const usersByCompany: Record<string, any[]>  = {};

  for (const r of reqs ?? []) {
    activeRolesMap[r.company_id] = (activeRolesMap[r.company_id] ?? 0) + 1;
  }
  for (const t of tickets ?? []) {
    openTicketsMap[t.company_id] = (openTicketsMap[t.company_id] ?? 0) + 1;
  }
  const now = Date.now();
  for (const c of complianceItems ?? []) {
    if (c.due_date && new Date(c.due_date).getTime() < now) {
      overdueCompMap[c.company_id] = (overdueCompMap[c.company_id] ?? 0) + 1;
    }
  }
  for (const p of profiles ?? []) {
    if (!usersByCompany[p.company_id]) usersByCompany[p.company_id] = [];
    usersByCompany[p.company_id].push(p);
  }

  const payload = {
    companies:      companies ?? [],
    activeRolesMap,
    openTicketsMap,
    overdueCompMap,
    usersByCompany,
    fetched_at: new Date().toISOString(),
  };

  return new NextResponse(JSON.stringify(payload), {
    status:  200,
    headers: {
      'content-type':  'application/json',
      // Shared edge cache (Vercel) for 30s; browsers keep serving stale
      // for up to 5 min while re-validating in the background.
      // Tightened from s-maxage=30 / SWR=300 to 10/60 so a freshly-onboarded
      // client appears in the list within 10s instead of up to 5 minutes.
      // Revalidation triggered by the create-client POST still wins; this
      // is the worst-case bound when no explicit bust happens.
      'cache-control': 'private, max-age=5, s-maxage=10, stale-while-revalidate=60',
    },
  });
}
