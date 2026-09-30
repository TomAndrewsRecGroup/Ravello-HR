'use client';

// Core-OS 360 Phase 7, Group 5 (Report Builder, versioning,
// distribution). A draft's own summary/recommendations/next-visit-date
// are ordinary session writes under portfolio-wide RLS
// (consultancy_visit_reports_consultancy_all, 176) — the same
// authorization boundary every other Command Centre write uses. Only
// ISSUING is server-side: generating the PDF, recording it, sending
// the email and flipping the visit's own lifecycle all need the
// service role this component itself never holds.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, Send, FileText, History } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { useUnsavedChangesWarning } from '@/components/ui/useUnsavedChangesWarning';
import { VISIT_REPORT_STATUS_LABELS } from '@/lib/consultancy/vocab';
import type { ConsultancyVisitReport } from '@/lib/consultancy/types';

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export default function ReportBuilderClient({ visitId, clientOrganisationId, report }: { visitId: string; clientOrganisationId: string; report: ConsultancyVisitReport | null }) {
  const router = useRouter();
  const isDraft = report === null || report.status === 'draft';

  const [summary, setSummary] = useState(report?.summary ?? '');
  const [recommendations, setRecommendations] = useState(report?.recommendations ?? '');
  const [nextVisitDate, setNextVisitDate] = useState(report?.next_visit_recommended_date ?? '');
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [startingRevision, setStartingRevision] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // Core-OS 360 Phase 7, Group 7 (visit-mode hardening). Unlike
  // VisitCaptureClient's observation form, a draft REPORT has no
  // localStorage-backed recovery of its own — the summary/
  // recommendations text is real, often substantial narrative, and a
  // navigation away with unsaved changes would lose it silently. Warn
  // only while genuinely dirty (unsaved changes against the last
  // loaded/saved values), never after a successful save.
  const isDirty = isDraft && (
    summary !== (report?.summary ?? '') || recommendations !== (report?.recommendations ?? '')
    || nextVisitDate !== (report?.next_visit_recommended_date ?? '')
  );
  useUnsavedChangesWarning(isDirty);

  async function saveDraft() {
    setSaving(true); setError(''); setSaved(false);
    const supabase = createClient();
    const payload = { summary: summary.trim() || null, recommendations: recommendations.trim() || null, next_visit_recommended_date: nextVisitDate || null };
    if (report && report.status === 'draft') {
      const res = await supabase.from('consultancy_visit_reports').update(payload, COUNT_EXACT)
        .eq('id', report.id).eq('row_version', report.row_version);
      setSaving(false);
      const outcome = judgeWrite({ error: res.error, count: res.count });
      if (!outcome.ok) {
        setError(res.count === 0 && !res.error
          ? 'Someone else changed this draft since you opened it. Refresh to see their change.'
          : outcome.message ?? 'Could not save the draft');
        return;
      }
    } else {
      const { error: err } = await supabase.from('consultancy_visit_reports').insert({ visit_id: visitId, ...payload });
      setSaving(false);
      if (err) { setError(err.message); return; }
    }
    setSaved(true);
    router.refresh();
  }

  async function issue() {
    setIssuing(true); setError('');
    const res = await fetch(`/api/consultancy/clients/${clientOrganisationId}/visits/${visitId}/report/issue`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    setIssuing(false);
    if (!res.ok) { setError(body.error ?? 'Could not issue the report'); return; }
    router.refresh();
  }

  async function startRevision() {
    if (!report) return;
    setStartingRevision(true); setError('');
    const supabase = createClient();
    const { error: err } = await supabase.from('consultancy_visit_reports').insert({
      visit_id: visitId, supersedes_id: report.id, version: report.version + 1,
      summary: report.summary, recommendations: report.recommendations, next_visit_recommended_date: report.next_visit_recommended_date,
    });
    setStartingRevision(false);
    if (err) { setError(err.message); return; }
    router.refresh();
  }

  return (
    <section className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>Report</h2>
        {report && (
          <span className="badge">v{report.version} — {VISIT_REPORT_STATUS_LABELS[report.status]}</span>
        )}
      </div>

      {isDraft ? (
        <div className="space-y-2">
          <div>
            <label className="label">Summary</label>
            <textarea className="input" rows={4} value={summary} onChange={e => setSummary(e.target.value)} placeholder="What did this visit find, overall?" />
          </div>
          <div>
            <label className="label">Recommendations</label>
            <textarea className="input" rows={3} value={recommendations} onChange={e => setRecommendations(e.target.value)} placeholder="What should the client do next?" />
          </div>
          <div className="sm:max-w-xs">
            <label className="label">Next visit recommended</label>
            <input type="date" className="input" value={nextVisitDate} onChange={e => setNextVisitDate(e.target.value)} />
          </div>
          {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary btn-sm" disabled={saving} onClick={saveDraft}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save draft
            </button>
            {saved && <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>Saved.</span>}
            {report && (
              <button type="button" className="btn-cta btn-sm" disabled={issuing} onClick={issue}>
                {issuing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Issue & send to client
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
          <p>Issued {fmt(report!.issued_at)}.</p>
          {report!.summary && <p>{report!.summary}</p>}
          {report!.recommendations && <p><strong>Recommendations:</strong> {report!.recommendations}</p>}
          {report!.next_visit_recommended_date && <p><strong>Next visit recommended:</strong> {fmt(report!.next_visit_recommended_date)}</p>}
          {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {report!.storage_path && (
              <span className="btn-ghost btn-sm inline-flex items-center gap-1"><FileText size={13} /> Filed to Reports</span>
            )}
            <button type="button" className="btn-secondary btn-sm" disabled={startingRevision} onClick={startRevision}>
              {startingRevision ? <Loader2 size={13} className="animate-spin" /> : <History size={13} />} Create new version
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
