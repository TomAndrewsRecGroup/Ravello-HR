import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const steps = [
  {
    num: '01',
    title: 'Submit your requirement',
    body: 'Tell Ravello about the role — seniority, must-haves, timeline, and any context about the business. No lengthy briefing document. A structured form takes 10 minutes.',
  },
  {
    num: '02',
    title: 'We coordinate sourcing',
    body: 'Ravello matches your requirement to the right specialist recruiters in our partner network. They source and screen — you don\'t manage multiple agencies or handle cold outreach.',
  },
  {
    num: '03',
    title: 'You see qualified candidates',
    body: 'Approved candidates appear in your portal with a summary, CV, and notes. You review, give feedback, and move people forward — all in one place, with no inbox chaos.',
  },
  {
    num: '04',
    title: 'Hire with confidence',
    body: 'Ravello supports the offer, onboarding setup, and post-hire check-in. The pipeline stays in your portal so you always know the status of every active role.',
  },
];

export default function HiringSystemSection() {
  return (
    <section className="section-padding section-alt">
      <div className="container-wide">

        <div className="grid lg:grid-cols-[400px_1fr] gap-16 items-start">

          {/* Left */}
          <div>
            <p className="eyebrow mb-4">How hiring works</p>
            <h2 className="display-lg mb-6" style={{ color: 'var(--ink)' }}>
              Access to top recruitment expertise — without managing multiple agencies.
            </h2>
            <p className="text-base leading-relaxed mb-8" style={{ color: 'var(--ink-soft)' }}>
              Ravello works with a network of specialist recruiters. When you have a role to fill, we
              coordinate the search on your behalf — bringing you qualified candidates without the
              noise of running an agency selection process yourself.
            </p>
            <Link href="/how-it-works" className="btn-primary">
              Full process walkthrough <ArrowRight size={15} />
            </Link>
          </div>

          {/* Right — steps */}
          <div className="space-y-4">
            {steps.map((s, i) => (
              <div
                key={s.num}
                className="flex gap-5 rounded-[16px] p-6 bg-white"
                style={{ border: '1px solid var(--brand-line)' }}
              >
                {/* Number */}
                <div className="flex-shrink-0">
                  <span
                    className="font-display font-bold text-[1.1rem]"
                    style={{ color: 'var(--brand-purple)', opacity: 0.7 }}
                  >
                    {s.num}
                  </span>
                </div>
                <div>
                  <h3 className="font-display font-semibold text-[1rem] mb-1.5" style={{ color: 'var(--ink)' }}>
                    {s.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                    {s.body}
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
