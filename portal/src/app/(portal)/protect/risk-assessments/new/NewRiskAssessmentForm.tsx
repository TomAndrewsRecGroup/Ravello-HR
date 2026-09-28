'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, LayoutTemplate, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { riskBand, riskScore } from '@/lib/hs/riskMatrix';
import { docPath } from '@/lib/hs/safetyVocab';
import RiskBadge from '@/components/safety/RiskBadge';
import type { MatrixRow, Person } from '../[id]/raTypes';

interface Template { id: string; title: string; description: string | null; version: number; source: string }
interface Hazard { id: string; reference: string; title: string; site_id: string | null; department_id: string | null }

// A new assessment is always a DRAFT (hs_doc_guard). The database draws
// the reference, stamps the author and refuses anything out of the
// organisation; this form sends only the content fields.
export default function NewRiskAssessmentForm({ companyId, userId, types, matrices, defaultMatrixId, templates, sites, departments, people, hazard }: {
  companyId: string; userId: string | null;
  types: { id: string; name: string }[];
  matrices: MatrixRow[]; defaultMatrixId: string;
  templates: Template[];
  sites: { id: string; name: string }[];
  departments: { id: string; name: string; site_id: string | null }[];
  people: Person[];
  hazard: Hazard | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'blank' | 'template'>(templates.length > 0 && !hazard ? 'template' : 'blank');
  const [title, setTitle] = useState(hazard ? `Risk assessment — ${hazard.title}`.slice(0, 200) : '');
  const [typeId, setTypeId] = useState('');
  const [siteId, setSiteId] = useState(hazard?.site_id ?? (sites.length === 1 ? sites[0].id : ''));
  const [deptId, setDeptId] = useState(hazard?.department_id ?? '');
  const [activity, setActivity] = useState('');
  const [description, setDescription] = useState('');
  const [assessor, setAssessor] = useState(people.some(p => p.user_id === userId) ? userId ?? '' : '');
  const [manager, setManager] = useState('');
  const [matrixId, setMatrixId] = useState(defaultMatrixId);
  const [assessmentDate, setAssessmentDate] = useState(new Date().toISOString().slice(0, 10));
  const [reviewDate, setReviewDate] = useState('');
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [lb, setLb] = useState(0);
  const [sb, setSb] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  // A template assessment takes the default matrix (hs_ra_defaults).
  const matrix = useMemo(() => matrices.find(m => m.id === (mode === 'template' ? defaultMatrixId : matrixId)) ?? matrices[0], [matrices, matrixId, mode, defaultMatrixId]);
  const initial = hazard ? riskScore(matrix, lb, sb) : null;
  const band = riskBand(matrix, initial);

  async function addHazardItem(sb2: ReturnType<typeof createClient>, raId: string, sortOrder: number): Promise<string | null> {
    if (!hazard) return null;
    const { error: err } = await sb2.from('risk_assessment_items').insert({
      risk_assessment_id: raId, company_id: companyId, hazard_id: hazard.id, hazard_description: hazard.title.slice(0, 2000),
      likelihood_before: lb, severity_before: sb, sort_order: sortOrder,
    });
    return err ? err.message : null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (hazard && (!lb || !sb)) { setError('Rate the initial likelihood and severity for the hazard.'); return; }
    if (reviewDate && reviewDate < assessmentDate) { setError('The review date cannot be before the assessment date.'); return; }
    setBusy(true); setError(null);
    const client = createClient();
    let id: string | null = null;
    let sortOrder = 0;
    if (mode === 'template') {
      if (!templateId) { setBusy(false); setError('Choose a template.'); return; }
      const { data, error: err } = await client.rpc('hs_instantiate_template', {
        p_template: templateId, p_site: siteId || null, p_title: title.trim() || null,
      });
      if (err || !data) { setBusy(false); setError(err?.message ?? 'The assessment was not created.'); return; }
      id = data as string;
      sortOrder = 1000;
    } else {
      const { data, error: err } = await client.from('risk_assessments').insert({
        company_id: companyId, title: title.trim(), assessment_type_id: typeId || null,
        activity_or_process: activity.trim() || null, description: description.trim() || null,
        site_id: siteId || null, department_id: deptId || null, assessor_id: assessor || null,
        responsible_manager_id: manager || null, risk_matrix_id: matrixId, assessment_date: assessmentDate,
        review_date: reviewDate || null, status: 'draft',
      }).select('id').single();
      if (err || !data) { setBusy(false); setError(err?.message ?? 'The assessment was not created.'); return; }
      id = data.id as string;
    }
    const itemProblem = await addHazardItem(client, id, sortOrder);
    setBusy(false);
    if (itemProblem) {
      // The assessment exists; say so and offer it rather than losing it.
      setCreated(id);
      setError(`The draft was created, but the hazard could not be added: ${itemProblem}`);
      return;
    }
    router.push(docPath('risk_assessment', id));
  }

  const opt = (p: Person) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>;
  const selectedTemplate = templates.find(t => t.id === templateId);

  return (
    <form onSubmit={submit} className="card p-4 sm:p-6 max-w-3xl space-y-4">
      <h2 className="font-display text-lg font-semibold" style={{ color: 'var(--ink)' }}>New risk assessment</h2>

      <div className="flex flex-wrap gap-2" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'template'} className={mode === 'template' ? 'btn-secondary btn-sm' : 'btn-ghost btn-sm'}
          style={{ minHeight: 44 }} onClick={() => setMode('template')} disabled={templates.length === 0}>
          <LayoutTemplate size={14} /> From a template
        </button>
        <button type="button" role="tab" aria-selected={mode === 'blank'} className={mode === 'blank' ? 'btn-secondary btn-sm' : 'btn-ghost btn-sm'}
          style={{ minHeight: 44 }} onClick={() => setMode('blank')}>
          <FileText size={14} /> Blank assessment
        </button>
      </div>

      {mode === 'template' ? (
        <div className="space-y-3">
          <label className="block"><span className="label">Template</span>
            <select className="input" value={templateId} onChange={e => setTemplateId(e.target.value)} required>
              {templates.map(t => <option key={t.id} value={t.id}>{t.title} · {t.source} · v{t.version}</option>)}
            </select>
          </label>
          {selectedTemplate?.description && <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{selectedTemplate.description}</p>}
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
            A template is a starting point, not an assessment. You get your own draft copy: check every hazard, rating and control
            against your own workplace before submitting it. Later changes to the template never alter your copy.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="label">Title (optional — defaults to the template&apos;s)</span>
              <input className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} /></label>
            <label className="block"><span className="label">Site</span>
              <select className="input" value={siteId} onChange={e => setSiteId(e.target.value)}>
                <option value="">Not site-specific</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></label>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2"><span className="label">Title</span>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required
              placeholder="e.g. Warehouse loading bay operations" /></label>
          <label className="block"><span className="label">Assessment type</span>
            <select className="input" value={typeId} onChange={e => setTypeId(e.target.value)}>
              <option value="">Not set</option>{types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></label>
          <label className="block"><span className="label">Risk matrix</span>
            <select className="input" value={matrixId} onChange={e => setMatrixId(e.target.value)}>
              {matrices.map(m => <option key={m.id} value={m.id}>{m.name}{m.id === defaultMatrixId ? ' (default)' : ''}</option>)}
            </select></label>
          <label className="block"><span className="label">Site</span>
            <select className="input" value={siteId} onChange={e => { setSiteId(e.target.value); setDeptId(''); }}>
              <option value="">Not site-specific</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></label>
          <label className="block"><span className="label">Department / area</span>
            <select className="input" value={deptId} onChange={e => setDeptId(e.target.value)}>
              <option value="">Not set</option>
              {departments.filter(d => !siteId || !d.site_id || d.site_id === siteId).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></label>
          <label className="block sm:col-span-2"><span className="label">Activity or process assessed</span>
            <input className="input" value={activity} onChange={e => setActivity(e.target.value)} maxLength={1000} /></label>
          <label className="block sm:col-span-2"><span className="label">Scope and description (optional)</span>
            <textarea className="input" rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={8000} /></label>
          <label className="block"><span className="label">Assessor</span>
            <select className="input" value={assessor} onChange={e => setAssessor(e.target.value)}>
              <option value="">Not named yet</option>{people.map(opt)}
            </select></label>
          <label className="block"><span className="label">Responsible manager</span>
            <select className="input" value={manager} onChange={e => setManager(e.target.value)}>
              <option value="">Not named yet</option>{people.map(opt)}
            </select></label>
          <label className="block"><span className="label">Assessment date</span>
            <input className="input" type="date" value={assessmentDate} onChange={e => setAssessmentDate(e.target.value)} required /></label>
          <label className="block"><span className="label">Review date (needed before submitting)</span>
            <input className="input" type="date" value={reviewDate} min={assessmentDate} onChange={e => setReviewDate(e.target.value)} /></label>
        </div>
      )}

      {hazard && (
        <fieldset className="space-y-2 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
          <legend className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>First hazard: {hazard.reference} — {hazard.title}</legend>
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Rate the INITIAL risk — before any further controls. You add controls and the residual rating on the next screen.</p>
          <div className="grid gap-3 sm:grid-cols-3 items-end">
            <label className="block"><span className="label">Likelihood (before)</span>
              <select className="input" value={lb || ''} onChange={e => setLb(Number(e.target.value))} required>
                <option value="">Choose…</option>
                {matrix.likelihood_labels.map((l, i) => <option key={i} value={i + 1}>{i + 1} — {l}</option>)}
              </select></label>
            <label className="block"><span className="label">Severity (before)</span>
              <select className="input" value={sb || ''} onChange={e => setSb(Number(e.target.value))} required>
                <option value="">Choose…</option>
                {matrix.severity_labels.map((l, i) => <option key={i} value={i + 1}>{i + 1} — {l}</option>)}
              </select></label>
            <div><span className="label">Initial risk</span><RiskBadge score={initial} level={band?.level} label={band?.label} /></div>
          </div>
        </fieldset>
      )}

      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      {created ? (
        <a className="btn-secondary" href={docPath('risk_assessment', created)}>Open the draft</a>
      ) : <div className="flex gap-2">
        <button className="btn-cta" style={{ minHeight: 44 }} disabled={busy || (mode === 'blank' && !title.trim())}>
          {busy && <Loader2 size={14} className="animate-spin" />} Create draft
        </button>
      </div>}
    </form>
  );
}
