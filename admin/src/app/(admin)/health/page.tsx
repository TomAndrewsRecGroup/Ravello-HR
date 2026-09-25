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
import { computeBand, computeChurnSignal, type HealthBand } from '@/lib/health/scoring';

export type { IvylensHealth };

export const metadata: Metadata = { title: 'Health Status' };
// Removed 'edge' runtime: Vercel serverless (Node) runs in dub1, same
// AWS region as Supabase eu-west-1 — drops Supabase RTT from ~120ms
// (transatlantic from a US edge node) to ~5ms per query.
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
  band:           HealthBand;
  /** Trend from client_health_snapshots (107) — null until the daily
   *  cron has built up enough history to say anything. */
  trend:          { decliningStreak: number; scoreDelta7d: number | null; atRisk: boolean } | null;
}

export default async function HealthStatusPage() {
  const supabase = await createServerSupabaseClient();
  const now = new Date();
  const fortnightAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString();

  const twoWeeksAgoDate = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);

  const [
    companiesRes,
    complianceRes,
    ticketsRes,
    stalledReqsRes,
    ivylens,
    rlsAuditRes,
    snapshotsRes,
  ] = await Promise.all([
    supabase.from('companies').select('id,slug,name,active').order('name'),
    supabase.from('compliance_items').select('company_id').lt('due_date', now.toISOString()).neq('status', 'complete'),
    supabase.from('tickets').select('company_id').in('status', ['open', 'in_progress']),
    supabase.from('requisitions').select('company_id,updated_at,stage').not('stage', 'in', '(filled,cancelled)').lt('updated_at', fortnightAgo),
    computeIvylensHealth(supabase),
    // Row-level security drift, reported by the database itself.
    // 251 policies had accumulated across 67 tables, 99 of them
    // superseded duplicates that were never dropped — and because
    // permissive policies are OR'd, the weakest of each pair was the
    // one deciding. This surfaces the next instance on the day it
    // appears instead of in an audit months later.
    supabase.rpc('rls_policy_audit'),
    // Two weeks of daily snapshots (107) is enough for both signals
    // computeChurnSignal looks at: a 3-day non-green streak and a
    // 7-day-old score to diff against.
    supabase.from('client_health_snapshots')
      .select('company_id, snapshot_date, band, engagement_score')
      .gte('snapshot_date', twoWeeksAgoDate)
      .order('snapshot_date', { ascending: false }),
  ]);

  const rlsFindings   = (rlsAuditRes.data ?? []) as { severity: string; table_name: string; detail: string }[];
  const companies     = companiesRes.data ?? [];
  const overdueComp   = complianceRes.data ?? [];
  const openTickets   = ticketsRes.data ?? [];
  const stalledReqs   = stalledReqsRes.data ?? [];

  const snapshotsByCompany = new Map<string, { snapshot_date: string; band: HealthBand; engagement_score: number }[]>();
  for (const s of (snapshotsRes.data ?? []) as { company_id: string; snapshot_date: string; band: HealthBand; engagement_score: number }[]) {
    const arr = snapshotsByCompany.get(s.company_id) ?? [];
    arr.push(s);
    snapshotsByCompany.set(s.company_id, arr);
  }

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
    const snaps = snapshotsByCompany.get(c.id) ?? [];
    return {
      ...base,
      band: computeBand(base),
      trend: snaps.length > 0 ? computeChurnSignal(snaps) : null,
    };
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
        <HealthClient ivylens={ivylens} clients={clientHealth} rag={rag} rlsFindings={rlsFindings} />
      </main>
    </>
  );
}
