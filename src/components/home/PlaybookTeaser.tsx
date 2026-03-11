import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const posts = [
  { cat: 'Hiring',       catStyle: 'pill-purple', title: 'Why your best candidates drop off between offer and start date' },
  { cat: 'Compliance',   catStyle: 'pill-blue',   title: 'The 6 things your employment contracts are probably missing' },
  { cat: 'Scripts',      catStyle: 'pill-navy',   title: 'Word-for-word: how to open a performance conversation' },
  { cat: 'Change & M&A', catStyle: 'pill-purple', title: 'What TUPE actually means for your acquisition (plain English)' },
];

export default function PlaybookTeaser() {
  return (
    <section className="section-padding" style={{ background: 'var(--bg)' }}>
      <div className="container-wide">
        <div className="flex items-end justify-between mb-12">
          <div>
            <p className="eyebrow mb-4">People Ops Playbook</p>
            <h2 className="font-display font-bold" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.5rem)', color: 'var(--ink)', letterSpacing: '-0.02em' }}>
              No-fluff HR guides.
            </h2>
          </div>
          <Link href="/playbook" className="hidden sm:flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70" style={{ color: 'var(--ink-soft)' }}>
            View all <ArrowRight size={14} />
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {posts.map((p) => (
            <Link key={p.title} href="/playbook" className="card flex flex-col gap-4 group">
              <span className={p.catStyle}>{p.cat}</span>
              <p className="text-sm font-semibold leading-snug flex-1 group-hover:text-[var(--brand-purple)] transition-colors"
                style={{ color: 'var(--ink)' }}
              >
                {p.title}
              </p>
              <span className="flex items-center gap-1 text-xs font-medium transition-all group-hover:gap-2"
                style={{ color: 'var(--brand-purple)' }}
              >
                Read <ArrowRight size={11} />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
