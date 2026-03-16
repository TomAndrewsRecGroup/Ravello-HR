import Link from 'next/link';
import { ArrowRight, BookOpen, Zap, Users2 } from 'lucide-react';

const RESOURCES = [
  { icon: BookOpen, tag: 'Guide',     title: 'The Hiring Drift Framework',   desc: 'Why roles keep coming back — and how to fix the pattern permanently.', color: '#7C5CF6', bg: 'rgba(124,92,246,0.08)' },
  { icon: Zap,      tag: 'Checklist', title: 'Policy Audit in 20 Minutes',   desc: "The 12 gaps most businesses don't know they have until it's too late.",  color: '#5B9BFF', bg: 'rgba(91,155,255,0.1)' },
  { icon: Users2,   tag: 'Framework', title: 'M&A People Due Diligence',     desc: 'What to look for — and what dealmakers consistently miss on people risk.', color: '#E07FC0', bg: 'rgba(224,127,192,0.1)' },
];

export default function PlaybookTeaser() {
  return (
    <section className="section-padding" style={{ background: 'var(--bg)' }}>
      <div className="container-wide">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-14">
          <div>
            <p className="eyebrow mb-5">
              <span className="w-1.5 h-1.5 rounded-full inline-block mr-2" style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }} />
              Free resources
            </p>
            <h2 className="section-title">The Ravello Playbook</h2>
          </div>
          <Link href="/playbook" className="inline-flex items-center gap-2 text-sm font-semibold hover:opacity-70 transition-opacity flex-shrink-0" style={{ color: 'var(--brand-purple)' }}>
            View all resources <ArrowRight size={14} />
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {RESOURCES.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.title} className="card group cursor-pointer">
                <div className="w-11 h-11 rounded-[14px] flex items-center justify-center mb-5" style={{ background: r.bg }}>
                  <Icon size={20} style={{ color: r.color }} />
                </div>
                <span className="inline-block text-[10px] font-bold uppercase tracking-widest mb-3 px-3 py-1.5 rounded-full" style={{ background: r.bg, color: r.color }}>
                  {r.tag}
                </span>
                <h3 className="font-bold text-[1.05rem] mb-2.5 leading-snug" style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}>{r.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{r.desc}</p>
                <div className="mt-5 flex items-center gap-1.5 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ color: r.color }}>
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
