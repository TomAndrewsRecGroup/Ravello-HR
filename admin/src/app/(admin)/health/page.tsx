import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import HealthClient from './HealthClient';
import { Activity } from 'lucide-react';

export const metadata: Metadata = { title: 'Health Status' };
export const runtime    = 'edge';
export const revalidate = 30;

const RATE_LIMIT_PER_DAY = 1000;

export interface ClientHealth {
  id:             string;
  name:           string;
  active:         boolean;
  overdue_comp:   number;
  open_tickets:   number;
  stalled_reqs:   number;
  recent_activity: string | null;
  band:           'green' | 'amber' | 'red';
}

export interface IvylensHealth {
  configured:     boolean;
  calls_last_24h: number;
  rate_limit_headroom: number;  // 0-100 %
  errors_last_24h: number;
  p50_latency_ms: number | null;
  last_call_at:   string | null;
  last_status:    number | null;
  cache_entries:  number;
  oldest_cache_at: string | null;
  rate_limited_hits: number;
}

function bandForClient(h: Omit<ClientHealth, 'band'>): ClientHealth['band'] {
  if (!h.active) return 'red';
  if (h.overdue_comp >= 3 || h.open_tickets >= 3 || h.stalled_reqs >= 2) return 'red';
  if (h.overdue_comp > 0 || h.open_tickets > 0 || h.stalled_reqs > 0) return 'amber';
  return 'green';
}

export default async function HealthStatusPage() {
  const supabase = createServerSupabaseClient();
  const now = new Date();
  const dayAgo     = new Date(now.getTime() - 86_400_000).toISOString();
  const fortnightAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString();

  const [
    companiesRes,
    complianceRes,
    ticketsRes,
    stalledReqsRes,
    callsRes,
    cacheRes,
  ] = await Promise.all([
    supabase.from('companies').select('id,name,active').order('name'),
    supabase.from('compliance_items').select('company_id').lt('due_date', now.toISOString()).neq('status', 'completed'),
    supabase.from('tickets').select('company_id').in('status', ['open', 'in_progress']),
    supabase.from('requisitions').select('company_id,updated_at,stage').not('stage', 'in', '(filled,cancelled)').lt('updated_at', fortnightAgo),
    supabase.from('ivylens_api_calls').select('status,duration_ms,rate_limited,called_at').gte('called_at', dayAgo).order('called_at', { ascending: false }),
    supabase.from('ivylens_cache').select('fetched_at,expires_at').order('fetched_at', { ascending: true }),
  ]);

  const companies     = companiesRes.data ?? [];
  const overdueComp   = complianceRes.data ?? [];
  const openTickets   = ticketsRes.data ?? [];
  const stalledReqs   = stalledReqsRes.data ?? [];
  const calls         = (callsRes.data ?? []) as Array<{ status: number; duration_ms: number; rate_limited: boolean; called_at: string }>;
  const cache         = (cacheRes.data ?? []) as Array<{ fetched_at: string; expires_at: string }>;

  // Per-company rollup
  const compByCompany: Record<string, number>    = {};
  const ticketsByCompany: Record<string, number> = {};
  const stalledByCompany: Record<string, number> = {};
  overdueComp.forEach((c: any) => { compByCompany[c.company_id] = (compByCompany[c.company_id] ?? 0) + 1; });
  openTickets.forEach((t: any) => { ticketsByCompany[t.company_id] = (ticketsByCompany[t.company_id] ?? 0) + 1; });
  stalledReqs.forEach((r: any) => { stalledByCompany[r.company_id] = (stalledByCompany[r.company_id] ?? 0) + 1; });

  const clientHealth: ClientHealth[] = companies.map((c: any) => {
    const base = {
      id:              c.id,
      name:            c.name,
      active:          c.active,
      overdue_comp:    compByCompany[c.id] ?? 0,
      open_tickets:    ticketsByCompany[c.id] ?? 0,
      stalled_reqs:    stalledByCompany[c.id] ?? 0,
      recent_activity: null as string | null,
    };
    return { ...base, band: bandForClient(base) };
  });

  // IvyLens rollup
  const errors = calls.filter(c => c.status >= 400 && !c.rate_limited).length;
  const rateLimitedCalls = calls.filter(c => c.rate_limited).length;
  const sortedLatencies  = calls.map(c => c.duration_ms).sort((a, b) => a - b);
  const p50Latency       = sortedLatencies.length ? sortedLatencies[Math.floor(sortedLatencies.length / 2)] : null;
  const headroom = Math.max(0, Math.min(100, Math.round((1 - calls.length / RATE_LIMIT_PER_DAY) * 100)));

  const ivylens: IvylensHealth = {
    configured:      Boolean(process.env.IVYLENS_API_URL),
    calls_last_24h:  calls.length,
    rate_limit_headroom: headroom,
    errors_last_24h: errors,
    p50_latency_ms:  p50Latency,
    last_call_at:    calls[0]?.called_at ?? null,
    last_status:     calls[0]?.status ?? null,
    cache_entries:   cache.length,
    oldest_cache_at: cache[0]?.fetched_at ?? null,
    rate_limited_hits: rateLimitedCalls,
  };

  const rag = {
    green: clientHealth.filter(c => c.band === 'green').length,
    amber: clientHealth.filter(c => c.band === 'amber').length,
    red:   clientHealth.filter(c => c.band === 'red').length,
  };

  return (
    <>
      <AdminTopbar
        title="Health Status"
        subtitle="Integration status and per-client health signals"
        actions={
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-semibold"
            style={{ background: 'rgba(20,184,166,0.10)', color: 'var(--teal)' }}>
            <Activity size={13} /> Live
          </div>
        }
      />
      <main className="admin-page flex-1">
        <HealthClient ivylens={ivylens} clients={clientHealth} rag={rag} />
      </main>
    </>
  );
}
