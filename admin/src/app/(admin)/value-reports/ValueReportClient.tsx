'use client';
import { useState, useMemo } from 'react';
import { Download, FileText, Building2, Briefcase, LifeBuoy, ShieldCheck, Users, BarChart3 } from 'lucide-react';

interface Props {
  companies: any[];
  requisitions: any[];
  candidates: any[];
  tickets: any[];
  documents: any[];
  complianceItems: any[];
  serviceRequests: any[];
  actions: any[];
  profiles: any[];
  services: any[];
}

function fmtMonth(date: Date): string {
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function inMonth(dateStr: string, year: number, month: number): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getFullYear() === year && d.getMonth() === month;
}

export default function ValueReportClient({ companies, requisitions, candidates, tickets, documents, complianceItems, serviceRequests, actions, profiles, services }: Props) {
  const now = new Date();
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  // Available months (last 12)
  const months = useMemo(() => {
    const m = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      m.push({ year: d.getFullYear(), month: d.getMonth(), label: fmtMonth(d) });
    }
    return m;
  }, []);

  // Generate report for selected company + month
  const report = useMemo(() => {
    if (!selectedCompany) return null;
    const cid = selectedCompany;
    const y = selectedYear;
    const m = selectedMonth;
    const company = companies.find(c => c.id === cid);

    // Filter data by company + month
    const monthReqs = requisitions.filter((r: any) => r.company_id === cid && inMonth(r.created_at, y, m));
    const filledReqs = requisitions.filter((r: any) => r.company_id === cid && r.stage === 'filled' && inMonth(r.updated_at, y, m));
    const monthCandidates = candidates.filter((c: any) => c.company_id === cid && inMonth(c.created_at, y, m));
    const monthTickets = tickets.filter((t: any) => t.company_id === cid && inMonth(t.created_at, y, m));
    const resolvedTickets = tickets.filter((t: any) => t.company_id === cid && inMonth(t.resolved_at, y, m));
    const monthDocs = documents.filter((d: any) => d.company_id === cid && inMonth(d.created_at, y, m));
    const monthCompliance = complianceItems.filter((c: any) => c.company_id === cid && inMonth(c.created_at, y, m));
    const monthServReqs = serviceRequests.filter((s: any) => s.company_id === cid && inMonth(s.created_at, y, m));
    const respondedServReqs = serviceRequests.filter((s: any) => s.company_id === cid && inMonth(s.responded_at, y, m));
    const monthActions = actions.filter((a: any) => a.company_id === cid && inMonth(a.created_at, y, m));
    const completedActions = actions.filter((a: any) => a.company_id === cid && inMonth(a.completed_at, y, m));

    // All-time stats
    const totalActiveRoles = requisitions.filter((r: any) => r.company_id === cid && !['filled', 'cancelled'].includes(r.stage)).length;
    const totalFilled = requisitions.filter((r: any) => r.company_id === cid && r.stage === 'filled').length;
    const totalUsers = profiles.filter((p: any) => p.company_id === cid).length;
    const activeServices = services.filter((s: any) => s.company_id === cid);
    const mrr = activeServices.reduce((sum: number, s: any) => sum + (s.monthly_fee ?? 0), 0);

    // Avg ticket resolution time
    const resolved = tickets.filter((t: any) => t.company_id === cid && t.resolved_at && inMonth(t.resolved_at, y, m));
    let avgResolution = 0;
    if (resolved.length > 0) {
      const totalHours = resolved.reduce((sum: number, t: any) => {
        return sum + (new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / 3600000;
      }, 0);
      avgResolution = Math.round(totalHours / resolved.length);
    }

    return {
      company,
      month: fmtMonth(new Date(y, m)),
      hire: { newRoles: monthReqs.length, filled: filledReqs.length, candidates: monthCandidates.length, activeRoles: totalActiveRoles, totalFilled },
      support: { ticketsRaised: monthTickets.length, ticketsResolved: resolvedTickets.length, avgResolutionHours: avgResolution, serviceRequests: monthServReqs.length, serviceRequestsResponded: respondedServReqs.length },
      protect: { complianceItems: monthCompliance.length, documentsUploaded: monthDocs.length, actionsCreated: monthActions.length, actionsCompleted: completedActions.length },
      usage: { portalUsers: totalUsers, activeServices, mrr },
    };
  }, [selectedCompany, selectedMonth, selectedYear, companies, requisitions, candidates, tickets, documents, complianceItems, serviceRequests, actions, profiles, services]);

  function downloadReport() {
    if (!report) return;
    const r = report;
    const lines = [
      `THE PEOPLE SYSTEM — CLIENT VALUE REPORT`,
      `${r.company?.name} | ${r.month}`,
      `Generated: ${new Date().toLocaleDateString('en-GB')}`,
      ``,
      `═══ HIRE ═══`,
      `New roles raised: ${r.hire.newRoles}`,
      `Roles filled this month: ${r.hire.filled}`,
      `Candidates submitted: ${r.hire.candidates}`,
      `Active roles (current): ${r.hire.activeRoles}`,
      `Total roles filled (all-time): ${r.hire.totalFilled}`,
      ``,
      `═══ SUPPORT ═══`,
      `Tickets raised: ${r.support.ticketsRaised}`,
      `Tickets resolved: ${r.support.ticketsResolved}`,
      `Avg resolution time: ${r.support.avgResolutionHours}h`,
      `Service requests: ${r.support.serviceRequests}`,
      `Service requests responded: ${r.support.serviceRequestsResponded}`,
      ``,
      `═══ PROTECT ═══`,
      `Compliance items addressed: ${r.protect.complianceItems}`,
      `Documents uploaded: ${r.protect.documentsUploaded}`,
      `Actions created: ${r.protect.actionsCreated}`,
      `Actions completed: ${r.protect.actionsCompleted}`,
      ``,
      `═══ SYSTEM USAGE ═══`,
      `Portal users: ${r.usage.portalUsers}`,
      `Active services: ${r.usage.activeServices.map((s: any) => s.service_name).join(', ') || 'None'}`,
      `Monthly fee: £${r.usage.mrr}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `value-report-${r.company?.name?.replace(/\s+/g, '-')}-${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Selectors */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <select className="input" style={{ maxWidth: 280 }} value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)}>
          <option value="">Select a client...</option>
          {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input" style={{ maxWidth: 200 }} value={`${selectedYear}-${selectedMonth}`} onChange={e => {
          const [y, m] = e.target.value.split('-').map(Number);
          setSelectedYear(y); setSelectedMonth(m);
        }}>
          {months.map(m => <option key={m.label} value={`${m.year}-${m.month}`}>{m.label}</option>)}
        </select>
        {report && (
          <button onClick={downloadReport} className="btn-cta btn-sm">
            <Download size={13} /> Download Report
          </button>
        )}
      </div>

      {!report ? (
        <div className="empty-state">
          <FileText size={28} />
          <p className="text-sm font-medium">Select a client to generate their value report</p>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
            Shows what The People System delivered during the selected month.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Report header */}
          <div className="card p-6" style={{ borderLeft: '3px solid var(--purple)' }}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-display text-xl" style={{ color: 'var(--ink)' }}>{report.company?.name}</h2>
              <span className="eyebrow">{report.month}</span>
            </div>
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Monthly value summary — The People System</p>
          </div>

          <div className="grid lg:grid-cols-3 gap-5">
            {/* HIRE */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Briefcase size={15} style={{ color: 'var(--purple)' }} />
                <h3 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>HIRE</h3>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'New roles raised', value: report.hire.newRoles },
                  { label: 'Roles filled', value: report.hire.filled, highlight: true },
                  { label: 'Candidates submitted', value: report.hire.candidates },
                  { label: 'Active roles (current)', value: report.hire.activeRoles },
                  { label: 'Total filled (all-time)', value: report.hire.totalFilled },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{item.label}</span>
                    <span className="text-sm font-bold" style={{ color: item.highlight ? 'var(--purple)' : 'var(--ink)' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* SUPPORT */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <LifeBuoy size={15} style={{ color: 'var(--blue)' }} />
                <h3 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>SUPPORT</h3>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Tickets raised', value: report.support.ticketsRaised },
                  { label: 'Tickets resolved', value: report.support.ticketsResolved, highlight: true },
                  { label: 'Avg resolution time', value: `${report.support.avgResolutionHours}h` },
                  { label: 'Service requests', value: report.support.serviceRequests },
                  { label: 'Requests responded', value: report.support.serviceRequestsResponded },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{item.label}</span>
                    <span className="text-sm font-bold" style={{ color: item.highlight ? 'var(--blue)' : 'var(--ink)' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* PROTECT */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck size={15} style={{ color: 'var(--teal)' }} />
                <h3 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>PROTECT</h3>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Compliance items addressed', value: report.protect.complianceItems },
                  { label: 'Documents uploaded', value: report.protect.documentsUploaded },
                  { label: 'Actions created', value: report.protect.actionsCreated },
                  { label: 'Actions completed', value: report.protect.actionsCompleted, highlight: true },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{item.label}</span>
                    <span className="text-sm font-bold" style={{ color: item.highlight ? 'var(--teal)' : 'var(--ink)' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* System Usage */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={15} style={{ color: 'var(--ink-faint)' }} />
              <h3 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>System Usage</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Portal Users</p>
                <p className="text-lg font-bold mt-1" style={{ color: 'var(--ink)' }}>{report.usage.portalUsers}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Active Services</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {report.usage.activeServices.length > 0
                    ? report.usage.activeServices.map((s: any) => (
                      <span key={s.id} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(124,58,237,0.06)', color: 'var(--purple)' }}>
                        {s.service_name}
                      </span>
                    ))
                    : <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>None</span>
                  }
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Monthly Fee</p>
                <p className="text-lg font-bold mt-1" style={{ color: 'var(--purple)' }}>
                  {report.usage.mrr > 0 ? `£${report.usage.mrr.toLocaleString()}` : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
