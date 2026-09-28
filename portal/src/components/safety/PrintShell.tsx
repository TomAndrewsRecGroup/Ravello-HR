import PrintButton from './PrintButton';

// A controlled-document print view (RA, RAMS, COSHH, incident report).
// Structured HTML with the app's own print stylesheet (globals.css
// @media print: A4, shell hidden) — never a screenshot. "Save as PDF"
// in the browser's print dialog produces the PDF.
export default function PrintShell({ title, organisation, reference, meta, children }: {
  title: string;
  organisation: string;
  reference: string;
  meta: { label: string; value: React.ReactNode }[];
  children: React.ReactNode;
}) {
  return (
    <main className="portal-page flex-1 print-area">
      <div className="no-print flex justify-end mb-3"><PrintButton /></div>
      <article className="card p-6 space-y-5 print-keep-color" style={{ maxWidth: 960, margin: '0 auto' }}>
        <header className="flex flex-wrap items-start justify-between gap-3 pb-3" style={{ borderBottom: '2px solid var(--ink)' }}>
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>{organisation}</p>
            <h1 className="font-display text-xl font-bold" style={{ color: 'var(--ink)' }}>{title}</h1>
          </div>
          <p className="font-mono text-sm" style={{ color: 'var(--ink-soft)' }}>{reference}</p>
        </header>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-sm">
          {meta.map(m => (
            <div key={m.label}>
              <dt className="text-xs" style={{ color: 'var(--ink-faint)' }}>{m.label}</dt>
              <dd style={{ color: 'var(--ink)' }}>{m.value ?? '—'}</dd>
            </div>
          ))}
        </dl>
        {children}
        <footer className="pt-3 text-xs" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-faint)' }}>
          Printed {new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}. A printed copy is uncontrolled — check the live version before relying on it.
        </footer>
      </article>
    </main>
  );
}

export function PrintSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2" style={{ pageBreakInside: 'avoid' }}>
      <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>{title}</h2>
      {children}
    </section>
  );
}
