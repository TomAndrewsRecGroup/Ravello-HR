'use client';
import { useState } from 'react';
import { CheckCircle2, ExternalLink, FileQuestion, Loader2, XCircle } from 'lucide-react';

interface TestQuestion { id: string; prompt: string; options: { id: string; label: string }[] }
interface TestInfo { title: string; description: string | null; source_type: string; external_url: string | null; questions: TestQuestion[] | null }

interface Props {
  token: string;
  employeeName: string;
  companyName: string;
  test: TestInfo;
  alreadyDone: boolean;
}

interface SubmitResult { score: number; passed: boolean; correctCount: number; totalCount: number }

export default function TestTakingForm({ token, employeeName, companyName, test, alreadyDone }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SubmitResult | null>(null);
  const done = alreadyDone || !!result;

  const questions = test.questions ?? [];
  const allAnswered = questions.length > 0 && questions.every(q => answers[q.id]);

  async function submit() {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/test/${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not record your result.');
      setResult({ score: data.score, passed: data.passed, correctCount: data.correctCount, totalCount: data.totalCount });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4" style={{ background: '#FAFAF8' }}>
        <div className="w-full max-w-[420px] text-center rounded-[20px] p-8" style={{ background: '#fff', border: '1px solid var(--line)' }}>
          {result ? (
            result.passed
              ? <CheckCircle2 size={44} style={{ color: 'var(--teal, #14B8A6)' }} className="mx-auto mb-3" />
              : <XCircle size={44} style={{ color: 'var(--red)' }} className="mx-auto mb-3" />
          ) : (
            <CheckCircle2 size={44} style={{ color: 'var(--teal, #14B8A6)' }} className="mx-auto mb-3" />
          )}
          <h1 className="font-display font-bold text-xl mb-2" style={{ color: '#0A0F1E' }}>
            {result ? (result.passed ? `Well done, ${employeeName.split(' ')[0]}` : `Thanks, ${employeeName.split(' ')[0]}`) : `Thank you, ${employeeName.split(' ')[0]}`}
          </h1>
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            {result
              ? `You scored ${result.score}% (${result.correctCount}/${result.totalCount}) on "${test.title}" — ${result.passed ? 'a pass' : 'below the pass mark'}. Your result has been recorded for ${companyName || 'your employer'}.`
              : `"${test.title}" has already been recorded for ${companyName || 'your employer'}. You can close this page.`}
          </p>
        </div>
      </main>
    );
  }

  // External or staff-marked source: nothing this page can submit.
  if (test.source_type !== 'built_in') {
    return (
      <main className="min-h-screen flex items-center justify-center px-4" style={{ background: '#FAFAF8' }}>
        <div className="w-full max-w-[480px] rounded-[20px] p-8" style={{ background: '#fff', border: '1px solid var(--line)' }}>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-faint)' }}>{companyName || 'Your employer'} · Test</p>
          <h1 className="font-display font-bold text-2xl mb-2" style={{ color: '#0A0F1E' }}>Hi {employeeName.split(' ')[0]}</h1>
          <p className="text-sm mb-2 font-semibold" style={{ color: '#0A0F1E' }}>{test.title}</p>
          {test.description && <p className="text-sm mb-4" style={{ color: 'var(--ink-soft)' }}>{test.description}</p>}
          {test.source_type === 'manual' ? (
            <p className="text-sm rounded-xl p-4" style={{ background: 'var(--surface-soft, #F4F5FB)', color: 'var(--ink-soft)' }}>
              This test is completed in person or by another means. Nothing to do here — your result will be logged for you once it is known.
            </p>
          ) : (
            <>
              <p className="text-sm mb-4" style={{ color: 'var(--ink-soft)' }}>
                Complete this {test.source_type === 'ms_forms' ? 'Microsoft Forms quiz' : 'test'} using the link below. Your result will be logged for you once it is known — there is nothing to submit on this page.
              </p>
              {test.external_url && (
                <a href={test.external_url} target="_blank" rel="noopener noreferrer" className="btn-cta w-full justify-center inline-flex items-center gap-2">
                  <ExternalLink size={16} /> Open the test
                </a>
              )}
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-start justify-center px-4 py-10" style={{ background: '#FAFAF8' }}>
      <div className="w-full max-w-[560px] rounded-[20px] p-8" style={{ background: '#fff', border: '1px solid var(--line)' }}>
        <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-faint)' }}>{companyName || 'Your employer'} · Test</p>
        <h1 className="font-display font-bold text-2xl mb-2" style={{ color: '#0A0F1E' }}>Hi {employeeName.split(' ')[0]}, please complete {test.title}</h1>
        {test.description && <p className="text-sm mb-6" style={{ color: 'var(--ink-soft)' }}>{test.description}</p>}

        <div className="space-y-5 mb-6">
          {questions.map((q, i) => (
            <div key={q.id} className="rounded-xl p-4" style={{ background: 'var(--surface-soft, #F4F5FB)', border: '1px solid var(--line)' }}>
              <div className="flex items-start gap-2 mb-3">
                <FileQuestion size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--purple)' }} />
                <p className="font-semibold text-sm" style={{ color: '#0A0F1E' }}>{i + 1}. {q.prompt}</p>
              </div>
              <div className="space-y-2 pl-6">
                {q.options.map(o => (
                  <label key={o.id} className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--ink)' }}>
                    <input
                      type="radio" name={q.id} value={o.id} checked={answers[q.id] === o.id}
                      onChange={() => setAnswers(a => ({ ...a, [q.id]: o.id }))}
                      className="w-4 h-4"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {error && <p role="alert" className="text-sm mb-4" style={{ color: 'var(--red)' }}>{error}</p>}

        <button type="button" onClick={submit} disabled={loading || !allAnswered} className="btn-cta w-full justify-center">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Submit answers
        </button>
        <p className="text-[11px] mt-4 text-center" style={{ color: 'var(--ink-faint)' }}>
          Your result is marked automatically and recorded for {companyName || 'your employer'}. No account or password is needed.
        </p>
      </div>
    </main>
  );
}
