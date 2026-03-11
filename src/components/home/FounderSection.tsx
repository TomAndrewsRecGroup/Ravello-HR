import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const credentials = [
  { label: 'Experience', value: '10+ years in senior HR leadership' },
  { label: 'Sectors',    value: 'FTSE-listed, PE-backed, retail, tech, manufacturing' },
  { label: 'Outcomes',   value: '0 tribunal outcomes across all structured work' },
  { label: 'Systems',    value: '3 named HR systems built from real-world practice' },
];

export default function FounderSection() {
  return (
    <section className="section-padding" style={{ background: 'var(--bg)' }}>
      <div className="container-wide">
        <div className="grid lg:grid-cols-2 gap-16 items-center">

          {/* Left — credentials block */}
          <div
            className="rounded-[24px] p-8 lg:p-10 relative overflow-hidden"
            style={{ background: 'var(--surface-alt)', border: '1px solid var(--brand-line)' }}
          >
            {/* Soft gradient top-right */}
            <div className="absolute top-0 right-0 w-48 h-48 pointer-events-none"
              style={{ background: 'radial-gradient(circle at 100% 0%, rgba(143,114,246,0.1) 0%, transparent 60%)' }}
            />
            <p className="eyebrow mb-6">Lucinda Reader</p>
            <div className="space-y-5">
              {credentials.map((c) => (
                <div key={c.label} className="flex gap-5">
                  <div className="w-px self-stretch" style={{ background: 'var(--gradient)' }} />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: 'var(--ink-faint)' }}>{c.label}</p>
                    <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{c.value}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 pt-6" style={{ borderTop: '1px solid var(--brand-line)' }}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs font-medium" style={{ color: 'var(--ink-soft)' }}>Currently taking new engagements</span>
              </div>
            </div>
          </div>

          {/* Right — copy */}
          <div>
            <p className="eyebrow mb-5">The founder</p>
            <h2 className="font-display font-bold mb-6 leading-tight"
              style={{ fontSize: 'clamp(1.8rem, 3vw, 2.5rem)', color: 'var(--ink)', letterSpacing: '-0.02em' }}
            >
              Senior HR expertise, delivered personally.
            </h2>
            <div className="space-y-4 mb-8" style={{ color: 'var(--ink-soft)' }}>
              <p className="text-base leading-relaxed">
                Lucinda spent over a decade leading HR inside large, complex organisations — through acquisitions, rapid growth and the kind of people challenges that textbooks don’t cover.
              </p>
              <p className="text-base leading-relaxed">
                She built Ravello HR because brilliant businesses kept being held back by the same three problems: hiring that didn’t stick, compliance built on hope, and transformation that lost the people it needed most.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/book" className="btn-primary">
                Work with Lucinda <ArrowRight size={15} />
              </Link>
              <Link href="/about" className="btn-secondary">
                Full story
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
