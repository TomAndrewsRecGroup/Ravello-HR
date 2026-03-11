export default function TrustBar() {
  const brands = [
    'FTSE 250', 'Private Equity', 'NHS Trusts', 'Global Law Firms',
    'VC-Backed Scale-ups', 'FMCG Groups', 'Professional Services',
  ];

  return (
    <section className="bg-brand-navy py-6 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
          <p className="text-white/40 text-xs font-semibold uppercase tracking-widest whitespace-nowrap">
            Sectors worked with
          </p>
          <div className="flex flex-wrap justify-center sm:justify-start gap-x-6 gap-y-2">
            {brands.map((b) => (
              <span key={b} className="text-white/60 text-sm font-medium hover:text-white/90 transition-colors">
                {b}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
