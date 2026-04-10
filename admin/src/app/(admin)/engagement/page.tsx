import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminTopbar from '@/components/layout/AdminTopbar';
import Link from 'next/link';
import { AlertTriangle, TrendingUp, LogIn, Eye, EyeOff } from 'lucide-react';

export const metadata: Metadata = { title: 'Client Engagement' };
export const revalidate = 60;

export default async function EngagementPage() {
  const supabase = createServerSupabaseClient();

  const [compRes, profileRes, reqRes, ticketRes, docRes, notesRes] = await Promise.all([
    supabase.from('companies').select('id, name, last_portal_login, login_count_30d').eq('active', true).order('name'),
    supabase.from('profiles').select('id, company_id').not('role', 'in', '("tps_admin","tps_client")'),
    supabase.from('requisitions').select('company_id, stage, created_at'),
    supabase.from('tickets').select('company_id, status, created_at'),
    supabase.from('documents').select('company_id', { count: 'exact', head: false }),
    supabase.from('client_notes').select('company_id, created_at').order('created_at', { ascending: false }),
  ]);

  const companies = compRes.data ?? [];
  const profiles = profileRes.data ?? [];
  const reqs = reqRes.data ?? [];
  const tickets = ticketRes.data ?? [];
  const docs = docRes.data ?? [];
  const notes = notesRes.data ?? [];

  // Pre-index data into Maps for O(1) lookups instead of O(n) .filter() per company
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 86400000;

  const profileCountMap = new Map<string, number>();
  for (const p of profiles) profileCountMap.set(p.company_id, (profileCountMap.get(p.company_id) ?? 0) + 1);

  const reqsByCompany = new Map<string, typeof reqs>();
  for (const r of reqs) { const arr = reqsByCompany.get(r.company_id) ?? []; arr.push(r); reqsByCompany.set(r.company_id, arr); }

  const ticketsByCompany = new Map<string, typeof tickets>();
  for (const t of tickets) { const arr = ticketsByCompany.get(t.company_id) ?? []; arr.push(t); ticketsByCompany.set(t.company_id, arr); }

  const docCountMap = new Map<string, number>();
  for (const d of docs) docCountMap.set(d.company_id, (docCountMap.get(d.company_id) ?? 0) + 1);

  const latestNoteMap = new Map<string, string>();
  for (const n of notes) { if (!latestNoteMap.has(n.company_id)) latestNoteMap.set(n.company_id, n.created_at); }

  const engagementData = companies.map((c: any) => {
    const companyReqs = reqsByCompany.get(c.id) ?? [];
    const companyTickets = ticketsByCompany.get(c.id) ?? [];

    const lastLogin = c.last_portal_login ? new Date(c.last_portal_login).getTime() : 0;
    const daysSinceLogin = lastLogin > 0 ? Math.floor((now - lastLogin) / 86400000) : 999;

    const activeRoles = companyReqs.filter((r: any) => !['filled', 'cancelled'].includes(r.stage)).length;
    const openTickets = companyTickets.filter((t: any) => !['closed', 'resolved'].includes(t.status)).length;
    const recentReqs = companyReqs.filter((r: any) => new Date(r.created_at).getTime() > thirtyDaysAgo).length;
    const recentTickets = companyTickets.filter((t: any) => new Date(t.created_at).getTime() > thirtyDaysAgo).length;
    const noteDate = latestNoteMap.get(c.id);
    const lastNote = noteDate ? Math.floor((now - new Date(noteDate).getTime()) / 86400000) : 999;

    let score = 50;
    if (daysSinceLogin <= 7) score += 20;
    else if (daysSinceLogin <= 14) score += 10;
    else if (daysSinceLogin > 30) score -= 20;
    else if (daysSinceLogin > 60) score -= 35;
    if (activeRoles > 0) score += 10;
    if (recentReqs > 0) score += 5;
    if (recentTickets > 0) score += 5;
    if ((docCountMap.get(c.id) ?? 0) > 0) score += 5;
    if (c.login_count_30d > 5) score += 5;
    score = Math.max(0, Math.min(100, score));

    const status = score >= 70 ? 'healthy' : score >= 40 ? 'at_risk' : 'disengaged';

    return {
      id: c.id,
      name: c.name,
      userCount: profileCountMap.get(c.id) ?? 0,
      daysSinceLogin,
      activeRoles,
      openTickets,
      recentReqs,
      recentTickets,
      docCount: docCountMap.get(c.id) ?? 0,
      loginCount30d: c.login_count_30d ?? 0,
      lastNote,
      score,
      status,
    };
  }).sort((a: any, b: any) => a.score - b.score);

  const healthy = engagementData.filter((c: any) => c.status === 'healthy').length;
  const atRisk = engagementData.filter((c: any) => c.status === 'at_risk').length;
  const disengaged = engagementData.filter((c: any) => c.status === 'disengaged').length;

  return (
    <>
      <AdminTopbar title="Client Engagement" subtitle="Portal usage, activity and churn risk" />
      <main className="admin-page flex-1">
        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="stat-card">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Total Clients</p>
            <p className="font-display font-bold text-2xl text-gradient">{companies.length}</p>
          </div>
          <div className="stat-card">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--emerald)' }}>Healthy</p>
            <p className="font-display font-bold text-2xl" style={{ color: 'var(--emerald)' }}>{healthy}</p>
          </div>
          <div className="stat-card">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--amber)' }}>At Risk</p>
            <p className="font-display font-bold text-2xl" style={{ color: 'var(--amber)' }}>{atRisk}</p>
          </div>
          <div className="stat-card">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--danger)' }}>Disengaged</p>
            <p className="font-display font-bold text-2xl" style={{ color: 'var(--danger)' }}>{disengaged}</p>
          </div>
        </div>

        {/* Client engagement table */}
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Score</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Logins (30d)</th>
                <th>Active Roles</th>
                <th>Open Tickets</th>
                <th>Users</th>
                <th>Last TPO Note</th>
              </tr>
            </thead>
            <tbody>
              {engagementData.map((c: any) => {
                const statusConfig = c.status === 'healthy'
                  ? { bg: 'rgba(52,211,153,0.12)', color: 'var(--emerald)', label: 'Healthy' }
                  : c.status === 'at_risk'
                  ? { bg: 'rgba(245,158,11,0.12)', color: 'var(--amber)', label: 'At Risk' }
                  : { bg: 'rgba(217,68,68,0.08)', color: 'var(--rose)', label: 'Disengaged' };

                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/clients/${c.id}`} className="text-sm font-medium hover:underline" style={{ color: 'var(--ink)' }}>
                        {c.name}
                      </Link>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-2 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                          <div className="h-full rounded-full" style={{
                            width: `${c.score}%`,
                            background: c.score >= 70 ? '#10B981' : c.score >= 40 ? '#F59E0B' : '#DC2626',
                          }} />
                        </div>
                        <span className="text-xs font-bold" style={{ color: statusConfig.color }}>{c.score}</span>
                      </div>
                    </td>
                    <td>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: statusConfig.bg, color: statusConfig.color }}>
                        {statusConfig.label}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs" style={{ color: c.daysSinceLogin > 30 ? '#DC2626' : c.daysSinceLogin > 14 ? '#D97706' : 'var(--ink-soft)' }}>
                        {c.daysSinceLogin === 999 ? 'Never' : c.daysSinceLogin === 0 ? 'Today' : `${c.daysSinceLogin}d ago`}
                      </span>
                    </td>
                    <td className="text-xs" style={{ color: 'var(--ink-soft)' }}>{c.loginCount30d}</td>
                    <td className="text-xs font-medium" style={{ color: c.activeRoles > 0 ? 'var(--purple)' : 'var(--ink-faint)' }}>{c.activeRoles}</td>
                    <td className="text-xs" style={{ color: c.openTickets > 0 ? '#D97706' : 'var(--ink-faint)' }}>{c.openTickets}</td>
                    <td className="text-xs" style={{ color: 'var(--ink-soft)' }}>{c.userCount}</td>
                    <td>
                      <span className="text-xs" style={{ color: c.lastNote > 14 ? '#DC2626' : 'var(--ink-faint)' }}>
                        {c.lastNote === 999 ? 'Never' : c.lastNote === 0 ? 'Today' : `${c.lastNote}d ago`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
