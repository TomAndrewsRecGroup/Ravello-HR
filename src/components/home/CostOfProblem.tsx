import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const COSTS = [
  {
    stat: '£27,500',
    pain: 'The average cost of a bad hire in the UK: salary, recruitment fees, lost productivity, and starting over',
  },
  {
    stat: '3×',
    pain: 'A single role that keeps reopening costs three times what a structured hiring process would',
  },
  {
    stat: '£8,500–£30k',
    pain: 'The average employment tribunal claim. Most stem from contracts, policies, or processes that were never reviewed',
  },
  {
    stat: '14 weeks',
    pain: 'Average UK time-to-hire. Every week without the right person costs output, momentum, and team morale',
  },
  {
    stat: '67%',
    pain: 'Of UK SMEs have compliance gaps that would not survive a basic audit. Most find out when something breaks.',
  },
];

export default function CostOfProblem() {
  return (
    <section className="section-padding" style={{ background: 'var(--surface)' }}>
      <div className="container-wide">
        <div className="grid lg:grid-cols-[1fr_420px] gap-16 items-center">

          <div>
            <p className="eyebrow mb-5">
              <span
                className="w-1.5 h-1.5 rounded-full inline-block mr-2"
                style={{ background: '#D94444', verticalAlign: 'middle' }}
              />
              The cost of doing nothing
            </p>

            <h2 className="font-display section-title mb-4">
              Every month you delay<br />costs more than the fix
            </h2>

            <p className="text-base leading-relaxed mb-10" style={{ color: 'var(--ink-soft)' }}>
              These are not hypothetical numbers. They are the measurable cost of leaving your people
              function to chance. The businesses that grow fastest fix this first.
            </p>

            <div className="space-y-0">
              {COSTS.map((item) => (
                <div
                  key={item.stat}
                  className="flex items-start gap-5 py-5"
                  style={{ borderBottom: '1px solid var(--brand-line)' }}
                >
                  <span
                    className="flex-shrink-0 font-bold text-lg"
                    style={{
                      color: '#D94444',
                      minWidth: 90,
                      fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {item.stat}
                  </span>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                    {item.pain}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap gap-4">
              <Link href="/book" className="btn-gradient">
                Fix this now: book a free call <ArrowRight size={15} />
              </Link>
              <Link href="/tools/hr-risk-score" className="btn-secondary">
                Find your gaps in 2 minutes <ArrowRight size={14} />
              </Link>
            </div>
          </div>

          {/* People image */}
          <div className="hidden lg:block">
            <div className="rounded-[24px] overflow-hidden" style={{ boxShadow: '0 8px 40px rgba(10,15,30,0.08)' }}>
              <Image
                src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&h=1000&fit=crop&crop=faces"
                alt="Team collaborating in a modern office"
                width={420}
                height={520}
                className="w-full h-auto object-cover"
              />
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
