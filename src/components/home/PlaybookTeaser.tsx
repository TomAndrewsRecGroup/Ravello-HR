import Link from 'next/link';
import { ArrowRight, BookOpen, Zap, Users2 } from 'lucide-react';

const RESOURCES = [
  {
    icon: BookOpen,
    tag: 'Guide',
    title: 'The Hiring Drift Framework',
    desc: 'Why roles keep coming back and exactly how to fix the pattern for good.',
    color: '#7C3AED',
    bg: 'rgba(124,58,237,0.08)',
  },
  {
    icon: Zap,
    tag: 'Checklist',
    title: 'Policy Audit in 20 Minutes',
    desc: "The 12 compliance gaps most businesses only discover when something goes wrong.",
    color: '#3B6FFF',
    bg: 'rgba(59,111,255,0.09)',
  },
  {
    icon: Users2,
    tag: 'Framework',
    title: 'M&A People Due Diligence',
    desc: 'What to look for and what dealmakers consistently overlook when it comes to people risk.',
    color: '#EA3DC4',
    bg: 'rgba(234,61,196,0.09)',
  },
];

export default function PlaybookTeaser() {
  return (
    <section className="section-padding" style={{ background: 'var(--bg)' }}>
      <div className="container-wide">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-14">
          <div>
            <p className="eyebrow mb-5">
              <span
                className="w-1.5 h-1.5 rounded-full inline-block mr-2"
                style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }}
              />
              Free resources
            </p>
            <h2 className="section-title">The Ravello Playbook</h2>
          </div>
          <Link
            href="/playbook"
            className="inline-flex items-center gap-2 text-sm font-semibold flex-shrink-0 transition-all duration-150 group"
            style={{ color: 'var(--brand-purple)' }}
          >
            View all resources{' '}
            <ArrowRight
              size={14}
              className="transition-transform duration-200 group-hover:translate-x-1"
            />
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {RESOURCES.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.title} className="card group cursor-pointer">
                {/* Icon */}
                <div
                  className="w-11 h-11 rounded-[14px] flex items-center justify-center mb-5"
                  style={{ background: r.bg }}
                >
                  <Icon size={20} style={{ color: r.color }} />
                </div>

                {/* Tag */}
                <span
                  className="inline-block text-[10px] font-bold uppercase tracking-[0.14em] mb-3 px-3 py-1.5 rounded-full"
                  style={{ background: r.bg, color: r.color }}
                >
                  {r.tag}
                </span>

                <h3
                  className="font-bold text-[1.05rem] mb-2.5 leading-snug"
                  style={{
                    color: 'var(--ink)',
                    letterSpacing: '-0.01em',
                    fontFamily: 'var(--font-dm-sans), "DM Sans", sans-serif',
                  }}
                >
                  {r.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                  {r.desc}
                </p>

                {/* Hover CTA */}
                <div
                  className="mt-5 flex items-center gap-1.5 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-0 -translate-x-1"
                  style={{ color: r.color }}
                >
                  Read more <ArrowRight size={11} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
