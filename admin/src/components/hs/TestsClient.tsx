'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GraduationCap, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useToast } from '@/components/modules/Toast';
import { HS_TEST_SOURCE_TYPES, HS_TEST_SOURCE_TYPE_LABELS } from '@/lib/hs/vocab';
import type { HsTestSourceType } from '@/lib/hs/vocab';
import type { HsTest } from '@/lib/hs/testTypes';

interface Props {
  tests: HsTest[];
}

interface DraftQuestion {
  id: string;
  prompt: string;
  options: { id: string; label: string }[];
  correct_option_id: string;
}

function newQuestion(): DraftQuestion {
  return {
    id: crypto.randomUUID(),
    prompt: '',
    options: [{ id: crypto.randomUUID(), label: '' }, { id: crypto.randomUUID(), label: '' }],
    correct_option_id: '',
  };
}

export default function TestsClient({ tests }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [sourceType, setSourceType] = useState<HsTestSourceType>('built_in');
  const [externalUrl, setExternalUrl] = useState('');
  const [passMark, setPassMark] = useState('70');
  const [questions, setQuestions] = useState<DraftQuestion[]>([newQuestion()]);
  const [certifiesTraining, setCertifiesTraining] = useState(false);
  const [recertMonths, setRecertMonths] = useState('');

  function reset() {
    setTitle(''); setDescription(''); setCategory(''); setSourceType('built_in'); setExternalUrl('');
    setPassMark('70'); setQuestions([newQuestion()]); setCertifiesTraining(false); setRecertMonths('');
  }

  function updateQuestion(id: string, patch: Partial<DraftQuestion>) {
    setQuestions(qs => qs.map(q => q.id === id ? { ...q, ...patch } : q));
  }
  function updateOption(qId: string, oId: string, label: string) {
    setQuestions(qs => qs.map(q => q.id === qId ? { ...q, options: q.options.map(o => o.id === oId ? { ...o, label } : o) } : q));
  }
  function addOption(qId: string) {
    setQuestions(qs => qs.map(q => q.id === qId && q.options.length < 6 ? { ...q, options: [...q.options, { id: crypto.randomUUID(), label: '' }] } : q));
  }

  async function create() {
    if (!title.trim()) { toast('Title is required', 'error'); return; }
    if (sourceType === 'built_in' && questions.some(q => !q.prompt.trim() || !q.correct_option_id || q.options.some(o => !o.label.trim()))) {
      toast('Every question needs a prompt, filled-in options, and a marked correct answer', 'error');
      return;
    }
    if ((sourceType === 'link' || sourceType === 'ms_forms') && !externalUrl.trim()) {
      toast('A link or Microsoft Forms test needs a URL', 'error');
      return;
    }
    setBusy(true);
    const res = await fetch('/api/admin/hs/tests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(), description: description.trim() || null, category: category.trim() || null,
        source_type: sourceType, external_url: externalUrl.trim() || null,
        pass_mark: sourceType === 'built_in' ? Number(passMark) : null,
        questions: sourceType === 'built_in' ? questions : null,
        certifies_training: certifiesTraining, recert_months: recertMonths ? Number(recertMonths) : null,
      }),
    });
    setBusy(false);
    const json = await res.json();
    if (!res.ok) { toast(json.error ?? 'Failed to create test', 'error'); return; }
    toast('Test created', 'success');
    setOpen(false); reset();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>{tests.length} test{tests.length === 1 ? '' : 's'} in the bank</p>
        <button className="btn-cta btn-sm flex items-center gap-1.5" onClick={() => setOpen(true)}>
          <Plus size={14} /> New test
        </button>
      </div>

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Test</th>
              <th>Source</th>
              <th>Category</th>
              <th>Certifies training</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {tests.map(t => (
              <tr key={t.id}>
                <td>
                  <Link href={`/health-safety/tests/${t.id}`} className="font-medium" style={{ color: 'var(--purple)' }}>{t.title}</Link>
                </td>
                <td>{HS_TEST_SOURCE_TYPE_LABELS[t.source_type]}</td>
                <td>{t.category || '—'}</td>
                <td>{t.certifies_training ? `Yes${t.recert_months ? ` (${t.recert_months}mo)` : ''}` : 'No'}</td>
                <td><span className="badge" style={{ opacity: t.active ? 1 : 0.5 }}>{t.active ? 'Active' : 'Archived'}</span></td>
              </tr>
            ))}
            {tests.length === 0 && (
              <tr><td colSpan={5} className="empty-state">No tests yet. Create one to start assigning it to employees.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: 'rgba(7,11,32,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget && !busy) setOpen(false); }}>
          <div className="card p-0 w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{ background: 'var(--surface)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
              <h3 className="font-display font-semibold text-base flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                <GraduationCap size={18} /> New test
              </h3>
              <button className="btn-icon" onClick={() => !busy && setOpen(false)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Title *</label>
                <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Fire Warden Refresher" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Category</label>
                  <input className="input" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Fire safety" />
                </div>
                <div>
                  <label className="label">Source</label>
                  <select className="input" value={sourceType} onChange={e => setSourceType(e.target.value as HsTestSourceType)}>
                    {HS_TEST_SOURCE_TYPES.map(s => <option key={s} value={s}>{HS_TEST_SOURCE_TYPE_LABELS[s]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
              </div>

              {(sourceType === 'link' || sourceType === 'ms_forms') && (
                <div>
                  <label className="label">{sourceType === 'ms_forms' ? 'Microsoft Forms URL' : 'Test URL'}</label>
                  <input className="input" type="url" value={externalUrl} onChange={e => setExternalUrl(e.target.value)} placeholder="https://…" />
                  <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
                    The employee opens this link from their invite. Once you know their result, log it from the test's own page.
                  </p>
                </div>
              )}
              {sourceType === 'manual' && (
                <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--surface-soft)', color: 'var(--ink-faint)' }}>
                  No link is needed — log the result yourself from the test's own page once it's administered in person.
                </p>
              )}

              {sourceType === 'built_in' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="label mb-0">Questions</label>
                    <button className="btn-secondary btn-sm flex items-center gap-1" onClick={() => setQuestions(qs => [...qs, newQuestion()])}>
                      <Plus size={12} /> Add question
                    </button>
                  </div>
                  {questions.map((q, i) => (
                    <div key={q.id} className="rounded-lg p-3 space-y-2" style={{ border: '1px solid var(--line)' }}>
                      <div className="flex items-center gap-2">
                        <input className="input" value={q.prompt} onChange={e => updateQuestion(q.id, { prompt: e.target.value })} placeholder={`Question ${i + 1}`} />
                        {questions.length > 1 && (
                          <button className="btn-icon" onClick={() => setQuestions(qs => qs.filter(x => x.id !== q.id))} aria-label="Remove question">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <div className="space-y-1.5 pl-2">
                        {q.options.map(o => (
                          <div key={o.id} className="flex items-center gap-2">
                            <input type="radio" name={`correct-${q.id}`} checked={q.correct_option_id === o.id}
                              onChange={() => updateQuestion(q.id, { correct_option_id: o.id })} />
                            <input className="input" style={{ padding: '6px 10px' }} value={o.label}
                              onChange={e => updateOption(q.id, o.id, e.target.value)} placeholder="Option text" />
                          </div>
                        ))}
                        {q.options.length < 6 && (
                          <button className="text-xs" style={{ color: 'var(--purple)' }} onClick={() => addOption(q.id)}>+ Add option</button>
                        )}
                      </div>
                    </div>
                  ))}
                  <div>
                    <label className="label">Pass mark (%)</label>
                    <input className="input" type="number" min={0} max={100} value={passMark} onChange={e => setPassMark(e.target.value)} style={{ maxWidth: 120 }} />
                  </div>
                </div>
              )}

              <div className="rounded-lg p-3" style={{ background: 'var(--surface-soft)' }}>
                <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
                  <input type="checkbox" checked={certifiesTraining} onChange={e => setCertifiesTraining(e.target.checked)} />
                  A pass also logs a completed training record for the employee
                </label>
                {certifiesTraining && (
                  <div className="mt-2">
                    <label className="label">Re-certify after (months, blank = never expires)</label>
                    <input className="input" type="number" min={1} max={120} value={recertMonths} onChange={e => setRecertMonths(e.target.value)} style={{ maxWidth: 160 }} />
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--line)' }}>
              <button className="btn-secondary btn-sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
              <button className="btn-cta btn-sm flex items-center gap-2" onClick={create} disabled={busy}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create test
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
