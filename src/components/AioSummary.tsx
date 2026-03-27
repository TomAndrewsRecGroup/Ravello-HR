// AIO / GEO enrichment block: structured for AI citation and search summarisation

interface AioSummaryProps {
  what: string;
  who: string;
  problem: string;
  next: string;
}

export default function AioSummary({ what, who, problem, next }: AioSummaryProps) {
  return (
    <div
      className="rounded-[18px] p-7"
      style={{ background: 'var(--surface-alt)', border: '1px solid var(--brand-line)' }}
      aria-label="Summary"
    >
      <p
        className="text-[10px] font-bold uppercase tracking-[0.18em] mb-5"
        style={{ color: 'var(--ink-faint)' }}
      >
        Summary
      </p>
      <dl className="space-y-4">
        {[
          { label: 'What this is', value: what },
          { label: 'Who it is for', value: who },
          { label: 'What problem it solves', value: problem },
          { label: 'What happens next', value: next },
        ].map((row) => (
          <div key={row.label} className="grid sm:grid-cols-[160px_1fr] gap-1 sm:gap-4">
            <dt className="text-xs font-semibold" style={{ color: 'var(--ink-faint)' }}>
              {row.label}
            </dt>
            <dd className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
