const SIGNALS = [
  { text: 'Lucy: 18+ years senior HR and People leadership' },
  { text: 'Tom: 10+ years in Talent and Recruitment' },
  { text: '100% confidential engagements' },
  { text: 'Fixed-scope, no surprise invoices' },
  { text: '0 tribunal outcomes across all restructure work' },
];

export default function TrustBar() {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: 'var(--brand-navy)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Gradient top line */}
      <div
        className="absolute top-0 left-0 right-0 h-[1.5px]"
        style={{ background: 'var(--gradient)' }}
      />

      <div className="container-wide px-6 lg:px-10 py-4">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2.5">
          {SIGNALS.map((s, i) => (
            <div
              key={s.text}
              className="flex items-center gap-2.5 text-[11px] font-medium"
              style={{ color: 'rgba(255,255,255,0.48)' }}
            >
              {/* Alternating gradient/gold dots for visual rhythm */}
              {i === 0 || i === 4 ? (
                /* Gold dot — quality markers */
                <span
                  className="w-[6px] h-[6px] rounded-full flex-shrink-0"
                  style={{ background: 'var(--gold-surface)' }}
                />
              ) : (
                /* Gradient dot */
                <span
                  className="w-[6px] h-[6px] rounded-full flex-shrink-0"
                  style={{ background: 'var(--gradient)' }}
                />
              )}
              {s.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
