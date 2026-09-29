'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { readAllPages } from '@/lib/supabase/paged';
import {
  EXISTING_COLUMNS, IMPORT_BATCH, IMPORT_KIND_LABELS, KIND_COLUMNS, chunk, existingKey, parseImportCsv, splitExisting,
  type ImportIssue, type ImportKind, type ImportReference, type ImportRow,
} from '@/lib/workforce/importCsv';

interface Preview {
  kind: ImportKind;
  fileName: string;
  toWrite: ImportRow[];
  errors: ImportIssue[];
  duplicates: ImportIssue[];
  ignoredColumns: string[];
}
interface RowResult { line: number; ok: boolean; message: string }

const VERIFY_NOTE: Record<ImportKind, string> = {
  training: 'Imported training records start unverified. A record for a safety-critical course (or where a role asks for verified evidence) counts towards Safe to Deploy only once someone with the verify permission has verified it.',
  competency: 'Imported assessments start unverified. Competence is met only by a verified assessment, so each one needs verifying before it counts towards Safe to Deploy. You cannot import an assessment of yourself.',
  credential: 'Imported qualifications and licences start unverified and need verifying before they count where verified evidence is required.',
};

export default function ImportClient({ kinds, reference }: { kinds: ImportKind[]; reference: ImportReference }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [kind, setKind] = useState<ImportKind>(kinds[0]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<'checking' | 'importing' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    setPreview(null); setResults(null); setError(null);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('The file is larger than 5 MB. Split it into smaller files.'); return; }
    setBusy('checking');
    try {
      const text = await file.text();
      const parsed = parseImportCsv(kind, text, reference);
      // Rows already on record (same person, item and date) are skipped.
      const existing = new Set<string>();
      const personIds = [...new Set(parsed.rows.map(r => r.record.person_id))];
      const { table, columns } = EXISTING_COLUMNS[kind];
      for (const ids of chunk(personIds, 200)) {
        const res = await readAllPages<Record<string, unknown>>((from, to) =>
          supabase.from(table).select(columns).in('person_id', ids).order('id').range(from, to));
        if (res.error) { setError(`Existing records could not be checked (${res.error}). Nothing has been imported.`); return; }
        for (const r of res.rows) existing.add(existingKey(kind, r));
      }
      const { toWrite, skipped } = splitExisting(parsed.rows, existing);
      setPreview({ kind, fileName: file.name, toWrite, errors: parsed.errors,
        duplicates: [...parsed.duplicates, ...skipped].sort((a, b) => a.line - b.line), ignoredColumns: parsed.ignoredColumns });
    } catch (e) {
      setError(`The file could not be read: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function runImport() {
    if (!preview || preview.toWrite.length === 0) return;
    setBusy('importing'); setError(null);
    const { table } = EXISTING_COLUMNS[preview.kind];
    const out: RowResult[] = [];
    const batches = chunk(preview.toWrite, IMPORT_BATCH);
    for (let i = 0; i < batches.length; i++) {
      setProgress(`Importing batch ${i + 1} of ${batches.length}…`);
      const batch = batches[i];
      const { error: e } = await supabase.from(table).insert(batch.map(r => r.record));
      if (!e) {
        for (const r of batch) out.push({ line: r.line, ok: true, message: `${r.personName} — ${r.itemName}: imported` });
        continue;
      }
      // A batch is all-or-nothing. Retry its rows one by one so the report
      // names exactly which rows the database refused, and why.
      for (const r of batch) {
        const { error: re } = await supabase.from(table).insert(r.record);
        out.push(re
          ? { line: r.line, ok: false, message: `${r.personName} — ${r.itemName}: ${re.message}` }
          : { line: r.line, ok: true, message: `${r.personName} — ${r.itemName}: imported` });
      }
    }
    setProgress(null);
    setResults(out.sort((a, b) => a.line - b.line));
    setPreview(null);
    setBusy(null);
    router.refresh();
  }

  const cols = KIND_COLUMNS[kind];
  const imported = results?.filter(r => r.ok).length ?? 0;
  const failed = results?.filter(r => !r.ok).length ?? 0;

  return (
    <div className="space-y-4">
      <section className="card p-4 space-y-3" aria-labelledby="import-step-1">
        <h2 id="import-step-1" className="font-display font-semibold text-base" style={{ color: 'var(--ink)' }}>1. Choose what to import</h2>
        <label className="block max-w-md">
          <span className="label">Record type</span>
          <select className="input" value={kind} disabled={busy !== null}
            onChange={e => { setKind(e.target.value as ImportKind); setPreview(null); setResults(null); setError(null); }}>
            {kinds.map(k => <option key={k} value={k}>{IMPORT_KIND_LABELS[k]}</option>)}
          </select>
        </label>
        <div className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          <p>Columns (header row, any order):</p>
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            <li><strong>email</strong> or <strong>employee_number</strong> — who the record is for (required)</li>
            {cols.required.map(c => <li key={c}><strong>{c}</strong> (required)</li>)}
            {cols.optional.map(c => <li key={c}>{c} (optional)</li>)}
          </ul>
          <p className="mt-2 text-xs" style={{ color: 'var(--ink-faint)' }}>
            Dates as yyyy-mm-dd or dd/mm/yyyy. Other columns are ignored. A column holding an id is refused.
          </p>
        </div>
        <p className="text-xs p-2 rounded" style={{ background: 'var(--surface-soft)', color: 'var(--ink-soft)' }}>{VERIFY_NOTE[kind]}</p>
      </section>

      <section className="card p-4 space-y-3" aria-labelledby="import-step-2">
        <h2 id="import-step-2" className="font-display font-semibold text-base" style={{ color: 'var(--ink)' }}>2. Upload and check</h2>
        <label className="block max-w-md">
          <span className="label">CSV file</span>
          <input className="input" type="file" accept=".csv,text/csv" disabled={busy !== null}
            onChange={e => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {busy === 'checking' && <p className="text-sm flex items-center gap-2" role="status"><Loader2 size={14} className="animate-spin" /> Checking the file…</p>}
        {error && <p className="text-sm" role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
      </section>

      {preview && (
        <section className="card p-4 space-y-3" aria-labelledby="import-step-3">
          <h2 id="import-step-3" className="font-display font-semibold text-base" style={{ color: 'var(--ink)' }}>
            3. Preview — {preview.fileName}
          </h2>
          <ul className="flex flex-wrap gap-2 text-sm" aria-label="Summary">
            <li className="badge" style={{ color: 'var(--teal)', border: '1px solid var(--teal)', background: 'var(--surface)' }}>{preview.toWrite.length} ready to import</li>
            <li className="badge" style={{ color: 'var(--red)', border: '1px solid var(--red)', background: 'var(--surface)' }}>{preview.errors.length} with errors</li>
            <li className="badge" style={{ color: 'var(--gold)', border: '1px solid var(--gold)', background: 'var(--surface)' }}>{preview.duplicates.length} duplicates skipped</li>
          </ul>
          {preview.ignoredColumns.length > 0 && (
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Ignored columns: {preview.ignoredColumns.join(', ')}</p>
          )}

          {preview.errors.length > 0 && <IssueTable caption="Rows with errors (not imported)" issues={preview.errors} tone="var(--red)" />}
          {preview.duplicates.length > 0 && <IssueTable caption="Duplicates (skipped)" issues={preview.duplicates} tone="var(--gold)" />}

          {preview.toWrite.length > 0 && (
            <div className="table-wrapper">
              <table className="table">
                <caption className="text-left text-sm font-semibold p-2">Rows to import</caption>
                <thead><tr><th scope="col">Line</th><th scope="col">Person</th><th scope="col">{IMPORT_KIND_LABELS[preview.kind]}</th><th scope="col">Date</th><th scope="col">Note</th></tr></thead>
                <tbody>
                  {preview.toWrite.slice(0, 200).map(r => (
                    <tr key={r.line}>
                      <td>{r.line}</td><td>{r.personName}</td><td>{r.itemName}</td><td className="whitespace-nowrap">{r.date}</td>
                      <td className="text-xs" style={{ color: 'var(--ink-faint)' }}>{r.safetyCritical ? 'Safety-critical: counts once verified' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.toWrite.length > 200 && (
                <p className="text-xs p-2" style={{ color: 'var(--ink-faint)' }}>…and {preview.toWrite.length - 200} more.</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" className="btn-cta btn-sm" disabled={busy !== null || preview.toWrite.length === 0} onClick={() => void runImport()}>
              {busy === 'importing' ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
              Import {preview.toWrite.length} row{preview.toWrite.length === 1 ? '' : 's'}
            </button>
            <button type="button" className="btn-ghost btn-sm" disabled={busy !== null} onClick={() => setPreview(null)}>Cancel</button>
            {progress && <span className="text-sm" role="status">{progress}</span>}
          </div>
        </section>
      )}

      {results && (
        <section className="card p-4 space-y-3" aria-labelledby="import-results" aria-live="polite">
          <h2 id="import-results" className="font-display font-semibold text-base" style={{ color: 'var(--ink)' }}>Import result</h2>
          <p className="text-sm">
            <strong>{imported}</strong> imported{failed > 0 && <>, <strong style={{ color: 'var(--red)' }}>{failed} refused</strong> by the database</>}.
            {imported > 0 && ' They now await verification.'}
          </p>
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th scope="col">Line</th><th scope="col">Result</th><th scope="col">Detail</th></tr></thead>
              <tbody>
                {results.map(r => (
                  <tr key={r.line}>
                    <td>{r.line}</td>
                    <td style={{ color: r.ok ? 'var(--teal)' : 'var(--red)', fontWeight: 600 }}>{r.ok ? 'Imported' : 'Refused'}</td>
                    <td className="text-sm">{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function IssueTable({ caption, issues, tone }: { caption: string; issues: ImportIssue[]; tone: string }) {
  return (
    <div className="table-wrapper">
      <table className="table">
        <caption className="text-left text-sm font-semibold p-2" style={{ color: tone }}>{caption}</caption>
        <thead><tr><th scope="col">Line</th><th scope="col">Problem</th></tr></thead>
        <tbody>
          {issues.map((e, i) => <tr key={`${e.line}-${i}`}><td>{e.line}</td><td className="text-sm">{e.message}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}
