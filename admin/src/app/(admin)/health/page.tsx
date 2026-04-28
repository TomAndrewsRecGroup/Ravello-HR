// Admin → Intelligence → Health Status. IvyLens integration health
// (call volume, latency, errors, rate-limit headroom) and per-client
// RAG roll-up. Reachable via the sidebar "Intelligence" group or
// directly at /health.
import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import HealthClient from './HealthClient';
import { Activity } from 'lucide-react';
import { computeIvylensHealth, type IvylensHealth } from '@/lib/ivylens/health';

export type { IvylensHealth };

export const metadata: Metadata = { title: 'Health Status' };
export const runtime    = 'edge';
export const revalidate = 30;

export interface ClientHealth {
  id:             string;
  slug:           string | null;
  name:           string;
  active:         boolean;
  overdue_comp:   number;
  open_tickets:   number;
  stalled_reqs:   number;
  recent_activity: string | null;
  band:           'green' | 'amber' | 'red';
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
  const fortnightAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString();

  const [
    companiesRes,
    complianceRes,
    ticketsRes,
    stalledReqsRes,
    ivylens,
  ] = await Promise.all([
    supabase.from('companies').select('id,slug,name,active').order('name'),
    supabase.from('compliance_items').select('company_id').lt('due_date', now.toISOString()).neq('status', 'completed'),
    supabase.from('tickets').select('company_id').in('status', ['open', 'in_progress']),
    supabase.from('requisitions').select('company_id,updated_at,stage').not('stage', 'in', '(filled,cancelled)').lt('updated_at', fortnightAgo),
    computeIvylensHealth(supabase),
  ]);

  const companies     = companiesRes.data ?? [];
  const overdueComp   = complianceRes.data ?? [];
  const openTickets   = ticketsRes.data ?? [];
  const stalledReqs   = stalledReqsRes.data ?? [];

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
      slug:            c.slug ?? null,
      name:            c.name,
      active:          c.active,
      overdue_comp:    compByCompany[c.id] ?? 0,
      open_tickets:    ticketsByCompany[c.id] ?? 0,
      stalled_reqs:    stalledByCompany[c.id] ?? 0,
      recent_activity: null as string | null,
    };
    return { ...base, band: bandForClient(base) };
  });

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
