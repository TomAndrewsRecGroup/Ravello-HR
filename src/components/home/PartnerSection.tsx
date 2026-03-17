import { CheckCircle2 } from 'lucide-react';

const benefits = [
  'Access to specialist recruiters across multiple disciplines',
  'One point of contact — Ravello manages the relationship',
  'Candidates are screened before they reach you',
  'No obligation to use the same agency twice',
  'Transparent process with full pipeline visibility',
  'No agency management overhead for your team',
];

export default function PartnerSection() {
  return (
    <section className="section-padding section-dark">
      <div className="container-wide">

        <div className="grid lg:grid-cols-2 gap-16 items-center">

          {/* Left — copy */}
          <div>
            <p className="eyebrow-light mb-4">Recruitment capability</p>
            <h2 className="display-lg text-white mb-6">
              Top recruitment expertise.<br /> Without managing multiple agencies.
            </h2>
            <p className="text-base leading-relaxed mb-8" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Ravello works with a network of specialist recruiters to deliver hiring support across a
              wide range of disciplines and sectors. When you need to hire, Ravello coordinates the
              search — you don&apos;t manage multiple agencies, handle unsolicited CVs, or negotiate
              competing fee structures.
            </p>

            <ul className="space-y-3">
              {benefits.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>
                  <CheckCircle2 size={15} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--brand-purple)' }} />
                  {b}
                </li>
              ))}
            </ul>
          </div>

          {/* Right — visual */}
          <div>
            <div
              className="rounded-[24px] p-8"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <p
                className="text-[10px] font-semibold uppercase tracking-[0.16em] mb-6"
                style={{ color: 'rgba(255,255,255,0.3)' }}
              >
                Ravello recruiter network — disciplines covered
              </p>

              <div className="flex flex-wrap gap-2.5">
                {[
                  'Finance & Accounting',
                  'Operations',
                  'Sales & BD',
                  'Marketing',
                  'Engineering',
                  'Technology',
                  'HR & People',
                  'Legal & Compliance',
                  'Executive & Leadership',
                  'Customer Success',
                  'Logistics & Supply Chain',
                  'Healthcare & Allied',
                ].map((d) => (
                  <span
                    key={d}
                    className="px-3 py-1.5 rounded-full text-xs font-medium"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.09)',
                      color: 'rgba(255,255,255,0.65)',
                    }}
                  >
                    {d}
                  </span>
                ))}
              </div>

              <div
                className="mt-6 pt-6 rounded-[14px] p-5"
                style={{
                  background: 'linear-gradient(135deg, rgba(143,114,246,0.1) 0%, rgba(147,184,255,0.08) 100%)',
                  border: '1px solid rgba(143,114,246,0.15)',
                }}
              >
                <p className="text-sm font-semibold text-white mb-1">
                  &ldquo;We don&apos;t replace your recruiter. We give you access to the right one.&rdquo;
                </p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Ravello matches your requirement to the specialist best suited for it — then manages the engagement on your behalf.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
