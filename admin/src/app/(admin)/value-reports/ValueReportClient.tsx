'use client';
import { useState, useMemo } from 'react';
import { Download, FileText, Building2, Briefcase, LifeBuoy, ShieldCheck, Users, BarChart3, GraduationCap } from 'lucide-react';
import { computeValueReport } from '@/lib/valueReport/computeReport';
import { buildReportPdf } from '@/lib/valueReport/buildReportPdf';

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
  trainingNeeds: any[];
  performanceReviews: any[];
  absenceRecords: any[];
  onboardingInstances: any[];
}

function fmtMonth(date: Date): string {
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export default function ValueReportClient({ companies, requisitions, candidates, tickets, documents, complianceItems, serviceRequests, actions, profiles, services, trainingNeeds, performanceReviews, absenceRecords, onboardingInstances }: Props) {
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

    const data = computeValueReport(cid, y, m, {
      requisitions, candidates, tickets, documents, complianceItems, serviceRequests, actions, profiles, services,
      trainingNeeds, performanceReviews, absenceRecords, onboardingInstances,
    });

    return { company, month: fmtMonth(new Date(y, m)), ...data };
  }, [selectedCompany, selectedMonth, selectedYear, companies, requisitions, candidates, tickets, documents, complianceItems, serviceRequests, actions, profiles, services, trainingNeeds, performanceReviews, absenceRecords, onboardingInstances]);

  async function downloadReport() {
    if (!report) return;
    // Lazy-load jsPDF + autotable so the page bundle stays small.
    // These are browser-side libs (~150 kB combined gzipped) and the
    // import dynamic chunk is only fetched the first time someone
    // clicks Download.
    const [{ default: jsPDF }, autoTableMod] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const autoTable = (autoTableMod as any).default ?? (autoTableMod as any);

    const doc = buildReportPdf(jsPDF as any, autoTable, {
      companyName: report.company?.name ?? '—',
      month: report.month,
      generatedAt: new Date(),
      data: report,
    });

    const safeName = (report.company?.name ?? 'client').replace(/\s+/g, '-');
    (doc as any).save(`value-report-${safeName}-${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}.pdf`);
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
            Shows what Core OS 360 delivered during the selected month.
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
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Monthly value summary: Core OS 360</p>
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">
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

            {/* LEAD */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <GraduationCap size={15} style={{ color: 'var(--gold)' }} />
                <h3 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>LEAD</h3>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Training needs flagged', value: report.lead.trainingNeedsFlagged },
                  { label: 'Training needs resolved', value: report.lead.trainingNeedsResolved, highlight: true },
                  { label: 'Reviews due', value: report.lead.reviewsDue },
                  { label: 'Reviews completed', value: report.lead.reviewsCompleted },
                  { label: 'Reviews overdue (current)', value: report.lead.reviewsOverdue },
                  { label: 'Absence days recorded', value: report.lead.absenceDays },
                  { label: 'Onboarding started', value: report.lead.onboardingStarted },
                  { label: 'Onboarding completed', value: report.lead.onboardingCompleted },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{item.label}</span>
                    <span className="text-sm font-bold" style={{ color: item.highlight ? 'var(--gold)' : 'var(--ink)' }}>{item.value}</span>
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
                      <span key={s.id} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(11,120,150,0.06)', color: 'var(--purple)' }}>
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
                  {report.usage.mrr > 0 ? `£${report.usage.mrr.toLocaleString()}` : '-'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
