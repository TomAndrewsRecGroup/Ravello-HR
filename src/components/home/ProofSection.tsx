import { CheckCircle } from 'lucide-react';

const stats = [
  { value: '15+', label: 'Years of senior HR experience' },
  { value: '£M+', label: 'In agency fees saved for clients' },
  { value: 'FTSE', label: 'Blue chip to start-up pedigree' },
  { value: '48h', label: 'Average time to first deliverable' },
];

const outcomes = [
  'Reduced time-to-hire by 40% through structured role definition',
  'Avoided £85k tribunal exposure with policy overhaul',
  'Led people integration across 3-entity acquisition in 90 days',
  'Designed management development programme for 200+ staff',
  'Built hiring function from scratch for VC-backed scale-up',
  'Turned around a 60% turnover department within 6 months',
];

export default function ProofSection() {
  return (
    <section className="section-padding bg-white">
      <div className="container-wide">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Stats */}
          <div>
            <p className="text-brand-teal text-sm font-semibold uppercase tracking-widest mb-3">
              Results, not promises
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-brand-navy mb-8">
              Work I’ve led. Outcomes that moved the needle.
            </h2>

            <div className="grid grid-cols-2 gap-6 mb-10">
              {stats.map((s) => (
                <div key={s.value} className="text-center p-6 bg-brand-light rounded-2xl">
                  <p className="font-display text-3xl font-bold text-brand-teal mb-1">{s.value}</p>
                  <p className="text-brand-slate text-sm">{s.label}</p>
                </div>
              ))}
            </div>

            <a
              href="/about#proof"
              className="btn-secondary"
            >
              See the Full Proof Page
            </a>
          </div>

          {/* Outcomes */}
          <div>
            <div className="bg-brand-offwhite rounded-2xl p-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-slate mb-5">
                Recent client outcomes (anonymised)
              </p>
              <ul className="space-y-3">
                {outcomes.map((o) => (
                  <li key={o} className="flex items-start gap-3">
                    <CheckCircle size={18} className="text-brand-teal flex-shrink-0 mt-0.5" />
                    <p className="text-brand-navy text-sm">{o}</p>
                  </li>
                ))}
              </ul>

              <div className="mt-6 p-4 bg-brand-teal/10 border border-brand-teal/20 rounded-xl">
                <p className="text-brand-navy font-semibold text-sm">
                  “Lucinda doesn’t just advise — she implements. The hiring framework she built is still running two years later.”
                </p>
                <p className="text-brand-slate text-xs mt-1">— COO, FTSE-adjacent professional services firm</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
