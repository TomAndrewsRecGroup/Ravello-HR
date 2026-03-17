import { AlertCircle, RefreshCw, EyeOff, FileX, Users } from 'lucide-react';

const problems = [
  {
    icon: RefreshCw,
    title: 'Hiring keeps breaking down',
    pain: 'Roles stay open for months. Agencies eat your budget. Candidates drop at offer. You fill the role, then re-open it six months later.',
    fix: 'Ravello coordinates structured hiring via a vetted recruiter network — with candidate pipelines visible in your portal.',
    accent: 'var(--brand-purple)',
  },
  {
    icon: FileX,
    title: 'No HR structure to rely on',
    pain: 'Contracts are outdated or inconsistent. Managers handle issues differently. There\'s no documented process for disciplinaries, grievances, or performance.',
    fix: 'Ravello gives you HR support and documentation frameworks — without the cost of a full-time hire.',
    accent: 'var(--brand-blue)',
  },
  {
    icon: Users,
    title: 'Employee issues land with no process',
    pain: 'Complaints, absence, underperformance — each one is handled ad hoc. Time is wasted. Risk accumulates. One bad call can cost the business significantly.',
    fix: 'Ravello gives you expert HR support for live situations and ongoing case management through your portal.',
    accent: 'var(--brand-pink)',
  },
  {
    icon: EyeOff,
    title: 'No visibility into what\'s happening',
    pain: 'You don\'t know the status of open roles, which documents are out of date, or what HR issues are sitting unresolved. Everything lives in emails and spreadsheets.',
    fix: 'The Ravello client portal gives you a single view across hiring activity, HR items, documents, and upcoming actions.',
    accent: 'var(--brand-teal)',
  },
];

export default function ProblemSection() {
  return (
    <section className="section-padding section-light">
      <div className="container-wide">

        <div className="grid lg:grid-cols-[380px_1fr] gap-16 items-start">

          {/* Left — fixed header */}
          <div className="lg:sticky lg:top-32">
            <p className="eyebrow mb-4">The problems we solve</p>
            <h2 className="display-lg mb-6" style={{ color: 'var(--ink)' }}>
              Four problems that slow every growing business down.
            </h2>
            <p className="text-base leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              Each one is addressable. Ravello is built to solve all four — as a system, not a
              series of one-off interventions.
            </p>
          </div>

          {/* Right — problem cards */}
          <div className="space-y-5">
            {problems.map((p) => (
              <div
                key={p.title}
                className="rounded-[20px] overflow-hidden"
                style={{ border: '1px solid var(--brand-line)' }}
              >
                {/* Problem */}
                <div className="p-6 bg-white">
                  <div className="flex items-start gap-4">
                    <div
                      className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: `color-mix(in srgb, ${p.accent} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${p.accent} 20%, transparent)` }}
                    >
                      <p.icon size={17} style={{ color: p.accent }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle size={13} className="flex-shrink-0" style={{ color: '#E05555' }} />
                        <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: '#E05555' }}>
                          The problem
                        </span>
                      </div>
                      <h3 className="font-display font-bold text-[1.05rem] mb-2" style={{ color: 'var(--ink)' }}>
                        {p.title}
                      </h3>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                        {p.pain}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Solution */}
                <div
                  className="px-6 py-4 flex items-start gap-3"
                  style={{
                    background: `color-mix(in srgb, ${p.accent} 6%, var(--surface-alt))`,
                    borderTop: `1px solid color-mix(in srgb, ${p.accent} 15%, var(--brand-line))`,
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-2"
                    style={{ background: p.accent }}
                  />
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                    <span className="font-semibold" style={{ color: 'var(--ink)' }}>Ravello: </span>
                    {p.fix}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
