export default function TrustBar() {
  const sectors = [
    'Retail & Hospitality',
    'Technology & SaaS',
    'Professional Services',
    'Finance & Accounting',
    'Manufacturing & Engineering',
    'Healthcare & Allied',
    'Logistics & Operations',
  ];

  return (
    <section className="section-xs section-dark">
      <div className="container-wide">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-10">
          <p
            className="text-xs font-semibold uppercase tracking-[0.18em] whitespace-nowrap"
            style={{ color: 'rgba(147,184,255,0.65)' }}
          >
            Sectors served
          </p>
          <div className="w-px h-5 hidden sm:block" style={{ background: 'rgba(255,255,255,0.1)' }} />
          <div className="flex flex-wrap gap-x-7 gap-y-3">
            {sectors.map((s) => (
              <span
                key={s}
                className="flex items-center gap-2 text-sm"
                style={{ color: 'rgba(255,255,255,0.45)' }}
              >
                <span
                  className="w-1 h-1 rounded-full"
                  style={{ background: 'rgba(143,114,246,0.6)' }}
                />
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
