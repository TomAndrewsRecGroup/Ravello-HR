'use client';
import { useState, useMemo } from 'react';
import { Download, FileText, Building2, Briefcase, LifeBuoy, ShieldCheck, Users, BarChart3, GraduationCap, Scale, Save, Loader2 } from 'lucide-react';
import { computeValueReport, computeQuarterlyValueReport } from '@/lib/valueReport/computeReport';
import { buildReportPdf } from '@/lib/valueReport/buildReportPdf';
import { createClient } from '@/lib/supabase/client';

interface Props {
  companies: any[];
  requisitions: any[];
  candidates: any[];
  documents: any[];
  complianceItems: any[];
  serviceRequests: any[];
  actions: any[];
  profiles: any[];
  trainingNeeds: any[];
  performanceReviews: any[];
  absenceRecords: any[];
  onboardingInstances: any[];
  standards: any[];
  standardClauses: any[];
  standardEvidenceLinks: any[];
  legalObligations: any[];
  complianceEvaluations: any[];
  objectives: any[];
  auditFindings: any[];
}

function fmtMonth(date: Date): string {
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

type PeriodType = 'month' | 'quarter';

export default function ValueReportClient({
  companies, requisitions, candidates, documents, complianceItems, serviceRequests, actions, profiles,
  trainingNeeds, performanceReviews, absenceRecords, onboardingInstances,
  standards, standardClauses, standardEvidenceLinks, legalObligations, complianceEvaluations, objectives, auditFindings,
}: Props) {
  const now = new Date();
  const currentQuarter = (Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedQuarter, setSelectedQuarter] = useState<1 | 2 | 3 | 4>(currentQuarter);
  const [selectedQuarterYear, setSelectedQuarterYear] = useState(now.getFullYear());
  const [narrative, setNarrative] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');

  // Available months (last 12)
  const months = useMemo(() => {
    const m = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      m.push({ year: d.getFullYear(), month: d.getMonth(), label: fmtMonth(d) });
    }
    return m;
  }, []);

  // Available quarters (last 8, i.e. two years back)
  const quarters = useMemo(() => {
    const q: { year: number; quarter: 1 | 2 | 3 | 4; label: string }[] = [];
    let y = now.getFullYear();
    let qtr = currentQuarter;
    for (let i = 0; i < 8; i++) {
      q.push({ year: y, quarter: qtr, label: `Q${qtr} ${y}` });
      qtr = (qtr - 1) as 1 | 2 | 3 | 4;
      if (qtr < 1) { qtr = 4; y -= 1; }
    }
    return q;
  }, []);

  const inputs = {
    requisitions, candidates, documents, complianceItems, serviceRequests, actions, profiles, companies,
    trainingNeeds, performanceReviews, absenceRecords, onboardingInstances,
    standards, standardClauses, standardEvidenceLinks, legalObligations, complianceEvaluations, objectives, auditFindings,
  };

  // Generate report for selected company + period (month or quarter).
  // Quarterly composition (computeQuarterlyValueReport) runs the
  // SAME, UNCHANGED per-month computeValueReport three times and
  // merges the result field-by-field (flow fields summed, stock
  // fields taken from the quarter's last month) — see computeReport.ts's
  // own header comment. The monthly path is completely untouched.
  const report = useMemo(() => {
    if (!selectedCompany) return null;
    const cid = selectedCompany;
    const company = companies.find(c => c.id === cid);

    if (periodType === 'quarter') {
      const data = computeQuarterlyValueReport(cid, selectedQuarterYear, selectedQuarter, inputs);
      return { company, month: `Q${selectedQuarter} ${selectedQuarterYear}`, period: `Q${selectedQuarter} ${selectedQuarterYear}`, ...data };
    }

    const data = computeValueReport(cid, selectedYear, selectedMonth, inputs);
    return { company, month: fmtMonth(new Date(selectedYear, selectedMonth)), period: fmtMonth(new Date(selectedYear, selectedMonth)), ...data };
  }, [
    selectedCompany, periodType, selectedMonth, selectedYear, selectedQuarter, selectedQuarterYear, companies, requisitions,
    candidates, documents, complianceItems, serviceRequests, actions, profiles, trainingNeeds,
    performanceReviews, absenceRecords, onboardingInstances, standards, standardClauses, standardEvidenceLinks,
    legalObligations, complianceEvaluations, objectives, auditFindings,
  ]);

  // Narrative is per (company, period) — never carries over silently
  // when the selection changes, so a consultant never accidentally
  // saves last quarter's commentary against this quarter's numbers.
  const reportKey = `${selectedCompany}|${periodType}|${periodType === 'quarter' ? `${selectedQuarterYear}-${selectedQuarter}` : `${selectedYear}-${selectedMonth}`}`;
  const [lastKey, setLastKey] = useState(reportKey);
  if (reportKey !== lastKey) {
    setLastKey(reportKey);
    setNarrative('');
    setSaveError('');
    setSaveSuccess('');
  }

  async function buildPdf() {
    // Lazy-load jsPDF + autotable so the page bundle stays small.
    // These are browser-side libs (~150 kB combined gzipped) and the
    // import dynamic chunk is only fetched the first time someone
    // clicks Download or Save.
    const [{ default: jsPDF }, autoTableMod] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const autoTable = (autoTableMod as any).default ?? (autoTableMod as any);

    return buildReportPdf(jsPDF as any, autoTable, {
      companyName: report!.company?.name ?? '—',
      month: report!.month,
      generatedAt: new Date(),
      data: report!,
      narrative,
    });
  }

  async function downloadReport() {
    if (!report) return;
    const doc = await buildPdf();
    const safeName = (report.company?.name ?? 'client').replace(/\s+/g, '-');
    const periodSlug = periodType === 'quarter'
      ? `${selectedQuarterYear}-Q${selectedQuarter}`
      : `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    (doc as any).save(`value-report-${safeName}-${periodSlug}.pdf`);
  }

  // Save & Upload: renders the identical PDF the Download button
  // produces, uploads it to the same private `documents` bucket
  // ReportUploadForm.tsx already uses (reports/<companyId>/…, never
  // getPublicUrl on a private bucket), then inserts a `reports` row
  // carrying the narrative — the portal's read-only /protect/reports
  // page and Client 360 can then show it with no new API route, since
  // `tps_reports` RLS is already FOR ALL for staff.
  async function saveReport() {
    if (!report || !selectedCompany) return;
    setSaving(true);
    setSaveError('');
    setSaveSuccess('');
    try {
      const doc = await buildPdf();
      const blob: Blob = (doc as any).output('blob');

      const supabase = createClient();

      const periodSlug = periodType === 'quarter'
        ? `${selectedQuarterYear}-Q${selectedQuarter}`
        : `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
      const path = `reports/${selectedCompany}/${Date.now()}_value-report-${periodSlug}.pdf`;

      const { error: uploadErr } = await supabase.storage.from('documents').upload(path, blob, {
        upsert: false,
        contentType: 'application/pdf',
      });
      if (uploadErr) { setSaveError(uploadErr.message); setSaving(false); return; }

      const { data: { user } } = await supabase.auth.getUser();
      const title = `Value Report — ${report.period}`;

      const { data: inserted, error: insertErr } = await supabase.from('reports').insert({
        company_id: selectedCompany,
        title,
        period: report.period,
        storage_path: path,
        generated_by: user?.id,
        narrative: narrative.trim() || null,
      }).select('id').single();
      if (insertErr) { setSaveError(insertErr.message); setSaving(false); return; }

      // Core-OS 360 Phase 6, Group 7 (section 13): records
      // value_report.generated. Fire-and-forget — an audit write must
      // never fail the save it records, so a failed request here is
      // ignored, not surfaced to the user; the report itself already
      // saved successfully above.
      fetch('/api/admin/value-reports/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedCompany, reportId: inserted.id, period: report.period }),
      }).catch(() => {});

      setSaveSuccess(`Saved "${title}" to this client's Reports.`);
      setSaving(false);
    } catch (e: any) {
      setSaveError(e?.message ?? 'Failed to save report.');
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Selectors */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6 items-start sm:items-center">
        <select className="input" style={{ maxWidth: 280 }} value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)}>
          <option value="">Select a client...</option>
          {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <div className="flex rounded-[8px] p-0.5" style={{ background: 'var(--surface-alt)', border: '1px solid var(--line)' }}>
          {(['month', 'quarter'] as PeriodType[]).map(pt => (
            <button
              key={pt}
              type="button"
              onClick={() => setPeriodType(pt)}
              className="px-3 py-1.5 rounded-[6px] text-xs font-medium transition-all"
              style={periodType === pt
                ? { background: 'var(--surface)', color: 'var(--ink)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                : { color: 'var(--ink-faint)' }}
            >
              {pt === 'month' ? 'Monthly' : 'Quarterly'}
            </button>
          ))}
        </div>

        {periodType === 'month' ? (
          <select className="input" style={{ maxWidth: 200 }} value={`${selectedYear}-${selectedMonth}`} onChange={e => {
            const [y, m] = e.target.value.split('-').map(Number);
            setSelectedYear(y); setSelectedMonth(m);
          }}>
            {months.map(m => <option key={m.label} value={`${m.year}-${m.month}`}>{m.label}</option>)}
          </select>
        ) : (
          <select className="input" style={{ maxWidth: 200 }} value={`${selectedQuarterYear}-${selectedQuarter}`} onChange={e => {
            const [y, q] = e.target.value.split('-').map(Number);
            setSelectedQuarterYear(y); setSelectedQuarter(q as 1 | 2 | 3 | 4);
          }}>
            {quarters.map(q => <option key={q.label} value={`${q.year}-${q.quarter}`}>{q.label}</option>)}
          </select>
        )}

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
            Shows what Core OS 360 delivered during the selected period.
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
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
              {periodType === 'quarter' ? 'Quarterly' : 'Monthly'} value summary: Core OS 360
            </p>
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-5">
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
                  { label: 'Service requests', value: report.support.serviceRequests },
                  { label: 'Requests responded', value: report.support.serviceRequestsResponded, highlight: true },
                  { label: 'Avg response time', value: `${report.support.avgResponseHours}h` },
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
            {/* GOVERNANCE */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Scale size={15} style={{ color: 'var(--red)' }} />
                <h3 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>GOVERNANCE</h3>
              </div>
              <div className="space-y-3">
                {report.governance.isoReadiness.map((s: { standardCode: string; clausesTotal: number; clausesWithEvidence: number }) => (
                  <div key={s.standardCode} className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{s.standardCode}</span>
                    <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{s.clausesWithEvidence}/{s.clausesTotal} clauses</span>
                  </div>
                ))}
                {[
                  { label: 'Legal obligations applicable', value: report.governance.legalObligationsApplicable },
                  { label: 'Legal evaluations this month', value: report.governance.legalEvaluationsThisMonth },
                  { label: 'Objectives on track (current)', value: report.governance.objectivesOnTrack, highlight: true },
                  { label: 'Audit findings opened', value: report.governance.auditFindingsOpenedThisMonth },
                  { label: 'Audit findings open (current)', value: report.governance.auditFindingsOpen },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{item.label}</span>
                    <span className="text-sm font-bold" style={{ color: item.highlight ? 'var(--red)' : 'var(--ink)' }}>{item.value}</span>
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
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Monthly Fee</p>
                <p className="text-lg font-bold mt-1" style={{ color: 'var(--purple)' }}>
                  {report.usage.mrr > 0 ? `£${report.usage.mrr.toLocaleString()}` : '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Core-OS 360 Phase 6, section 10: consultant commentary +
              save. Free text alongside the computed numbers above —
              never fed back into any computation. Saving renders the
              identical PDF Download produces, uploads it to this
              client's Reports (visible read-only on the portal's
              Client 360 and /protect/reports), and records the
              narrative alongside it. */}
          <div className="card p-5">
            <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--ink)' }}>Consultant Notes</h3>
            <p className="text-xs mb-3" style={{ color: 'var(--ink-faint)' }}>
              Optional commentary for this {periodType === 'quarter' ? 'quarter' : 'month'} — included in the saved/downloaded PDF and shown to the client.
            </p>
            <textarea
              className="input"
              rows={5}
              value={narrative}
              onChange={e => setNarrative(e.target.value)}
              placeholder="e.g. This quarter we focused on closing the audit findings from the March walk-round..."
            />
            <div className="flex items-center gap-3 mt-3">
              <button onClick={saveReport} disabled={saving} className="btn-secondary btn-sm">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {saving ? 'Saving…' : 'Save to Client Reports'}
              </button>
              {saveError && <span className="text-xs" style={{ color: 'var(--red)' }}>{saveError}</span>}
              {saveSuccess && <span className="text-xs" style={{ color: 'var(--teal)' }}>{saveSuccess}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
