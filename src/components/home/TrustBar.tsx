export default function TrustBar() {
  const sectors = [
    'FTSE-listed businesses',
    'PE-backed scale-ups',
    'Multi-site retail',
    'Tech & SaaS',
    'Manufacturing',
    'Healthcare & Services',
  ];

  return (
    <section className="section-sm" style={{ background: 'var(--brand-navy)' }}>
      <div className="container-wide">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] whitespace-nowrap" style={{ color: 'rgba(147,184,255,0.7)' }}>
            Sectors served
          </p>
          <div className="w-px h-5 hidden sm:block" style={{ background: 'rgba(255,255,255,0.1)' }} />
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            {sectors.map((s) => (
              <span key={s} className="flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
                <span className="w-1 h-1 rounded-full" style={{ background: 'rgba(143,114,246,0.6)' }} />
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
