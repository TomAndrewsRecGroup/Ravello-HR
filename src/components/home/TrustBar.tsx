export default function TrustBar() {
  const items = [
    'FTSE-listed businesses',
    'PE-backed scale-ups',
    'Multi-site retail',
    'Tech & SaaS',
    'Manufacturing',
    'Healthcare & Services',
  ];

  return (
    <section className="relative bg-brand-deep border-y border-brand-violet/20 py-5 overflow-hidden">
      {/* Glow line top */}
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, #6B21FF, #E040FB, transparent)' }} />
      <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(107,33,255,0.3), transparent)' }} />

      <div className="container-wide px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <span className="font-mono text-[10px] text-brand-violet uppercase tracking-widest whitespace-nowrap">
            // Sectors served
          </span>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {items.map((item) => (
              <span key={item} className="flex items-center gap-2 text-xs text-brand-slate font-medium">
                <span className="w-1 h-1 rounded-full bg-brand-violet/60" />
                {item}
              </span>
            ))}
          </div>
          <div className="ml-auto hidden lg:flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand-violet animate-pulse" />
            <span className="font-mono text-[10px] text-brand-slate uppercase tracking-widest">UK-based · Remote-ready</span>
          </div>
        </div>
      </div>
    </section>
  );
}
