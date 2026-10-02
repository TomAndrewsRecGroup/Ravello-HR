// Admin → Intelligence → Health Status. IvyLens integration health
// (call volume, latency, errors, rate-limit headroom), the live RLS
// policy-drift audit, and per-client compliance RAG + commercial
// engagement in one table. Reachable via the sidebar "Intelligence"
// group or directly at /health.
//
// Go-live gap list, item 3 (2026-10-02): "keep only one" dashboard —
// /engagement merged in here rather than retired outright, since it
// carries genuinely distinct content (portal usage, logins, churn
// risk) this page never had. /health survives as the ONE cross-client
// portfolio list (IvyLens health + RLS audit have no per-client
// equivalent and stay here); /engagement now redirects here. Each row
// links out to that client's own Core 360 Status page too, so the
// portfolio list and the per-client detail page are no longer two
// disconnected surfaces.
import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import AdminTopbar from '@/components/layout/AdminTopbar';
import HealthClient from './HealthClient';
import { Activity } from 'lucide-react';
import { computeIvylensHealth, type IvylensHealth } from '@/lib/ivylens/health';
import { computeBand, computeChurnSignal, computeEngagementScore, type HealthBand } from '@/lib/health/scoring';

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
  /** Merged in from the retired /engagement page (go-live gap list,
   *  item 3) — commercial usage/churn, a different signal from the
   *  compliance-RAG band above. */
  engagement: {
    score: number;
    status: 'healthy' | 'at_risk' | 'disengaged';
    daysSinceLogin: number;
    loginCount30d: number;
    activeRoles: number;
    userCount: number;
    lastNote: number;
  };
}

export default async function HealthStatusPage() {
  const supabase = await createServerSupabaseClient();
  const now = new Date();
  const nowMs = now.getTime();
  const fortnightAgo = new Date(nowMs - 14 * 86_400_000).toISOString();
  const thirtyDaysAgo = nowMs - 30 * 86400000;

  const twoWeeksAgoDate = new Date(nowMs - 14 * 86_400_000).toISOString().slice(0, 10);

  const [
    companiesRes,
    complianceRes,
    ticketsRes,
    stalledReqsRes,
    ivylens,
    rlsAuditRes,
    snapshotsRes,
    profilesPage,
    reqsPage,
    docsRes,
    notesPage,
  ] = await Promise.all([
    supabase.from('companies').select('id,slug,name,active,last_portal_login,login_count_30d').order('name'),
    supabase.from('compliance_items').select('company_id').lt('due_date', now.toISOString()).neq('status', 'complete'),
    // tickets/ticket_messages were retired as the support object back in
    // "Support & BD in sync" — service_requests is the live one
    // (new|in_progress|complete). This used to read the now-permanently-
    // empty tickets table, so open_tickets had silently read zero for
    // every client since that migration.
    supabase.from('service_requests').select('company_id').in('status', ['new', 'in_progress']),
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
    // --- Engagement (merged from the retired /engagement page) ---
    readAllPages<{ id: string; company_id: string }>((from, to) =>
      supabase.from('profiles').select('id, company_id').neq('role', 'tps_admin').order('id').range(from, to)),
    readAllPages<{ company_id: string; stage: string; created_at: string }>((from, to) =>
      supabase.from('requisitions').select('company_id, stage, created_at').order('id').range(from, to)),
    supabase.from('documents').select('company_id', { count: 'exact', head: true }),
    readAllPages<{ company_id: string; created_at: string }>((from, to) =>
      supabase.from('client_notes').select('company_id, created_at').order('created_at', { ascending: false }).order('id').range(from, to)),
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

  const profileCountMap = new Map<string, number>();
  for (const p of profilesPage.rows) profileCountMap.set(p.company_id, (profileCountMap.get(p.company_id) ?? 0) + 1);

  const reqsByCompany = new Map<string, typeof reqsPage.rows>();
  for (const r of reqsPage.rows) { const arr = reqsByCompany.get(r.company_id) ?? []; arr.push(r); reqsByCompany.set(r.company_id, arr); }

  const docCountMap = new Map<string, number>();
  for (const d of (docsRes.data ?? []) as { company_id: string }[]) docCountMap.set(d.company_id, (docCountMap.get(d.company_id) ?? 0) + 1);

  const latestNoteMap = new Map<string, string>();
  for (const n of notesPage.rows) { if (!latestNoteMap.has(n.company_id)) latestNoteMap.set(n.company_id, n.created_at); }

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

    const companyReqs = reqsByCompany.get(c.id) ?? [];
    const lastLogin = c.last_portal_login ? new Date(c.last_portal_login).getTime() : 0;
    const daysSinceLogin = lastLogin > 0 ? Math.floor((nowMs - lastLogin) / 86400000) : 999;
    const activeRoles = companyReqs.filter((r) => !['filled', 'cancelled'].includes(r.stage)).length;
    const recentReqs = companyReqs.filter((r) => new Date(r.created_at).getTime() > thirtyDaysAgo).length;
    const noteDate = latestNoteMap.get(c.id);
    const lastNote = noteDate ? Math.floor((nowMs - new Date(noteDate).getTime()) / 86400000) : 999;
    const score = computeEngagementScore({
      daysSinceLogin, activeRoles, recentReqs,
      recentTickets: ticketsByCompany[c.id] ?? 0,
      docCount: docCountMap.get(c.id) ?? 0, loginCount30d: c.login_count_30d ?? 0,
    });
    const status: ClientHealth['engagement']['status'] = score >= 70 ? 'healthy' : score >= 40 ? 'at_risk' : 'disengaged';

    return {
      ...base,
      band: computeBand(base),
      trend: snaps.length > 0 ? computeChurnSignal(snaps) : null,
      engagement: {
        score, status, daysSinceLogin,
        loginCount30d: c.login_count_30d ?? 0,
        activeRoles,
        userCount: profileCountMap.get(c.id) ?? 0,
        lastNote,
      },
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
        subtitle="Integration status, per-client compliance and engagement"
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
