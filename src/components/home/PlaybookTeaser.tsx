import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';

const posts = [
  { cat: 'Hiring',      catColor: 'text-brand-violet', title: 'Why your best candidates drop off between offer and start date' },
  { cat: 'Compliance',  catColor: 'text-brand-pink',   title: 'The 6 things your employment contracts are probably missing' },
  { cat: 'Scripts',     catColor: 'text-brand-cyan',   title: 'Word-for-word: how to open a performance conversation' },
  { cat: 'Change & M&A',catColor: 'text-brand-violet', title: 'What TUPE actually means for your acquisition (plain English)' },
];

export default function PlaybookTeaser() {
  return (
    <section className="section-padding bg-brand-void relative overflow-hidden">
      <div className="absolute inset-0 cyber-grid opacity-30" />

      <div className="relative z-10 container-wide">
        <div className="flex items-end justify-between mb-12">
          <div>
            <p className="font-mono text-brand-violet text-xs uppercase tracking-widest mb-3">// People ops playbook</p>
            <h2 className="font-display text-4xl lg:text-5xl font-bold text-white">No-fluff HR guides.</h2>
          </div>
          <Link href="/playbook" className="hidden sm:flex items-center gap-2 font-mono text-xs text-brand-slate hover:text-white transition-colors">
            View all <ArrowRight size={12} />
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {posts.map((p) => (
            <Link key={p.title} href="/playbook"
              className="bg-brand-panel border border-brand-muted/30 p-5 flex flex-col gap-3 group hover:border-brand-violet/40 transition-all"
              style={{ clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))' }}
            >
              <span className={`font-mono text-xs uppercase tracking-widest ${p.catColor}`}>{p.cat}</span>
              <p className="text-white/80 text-sm font-semibold leading-snug group-hover:text-white transition-colors flex-1">{p.title}</p>
              <span className="flex items-center gap-1 text-brand-violet text-xs font-mono mt-auto group-hover:gap-2 transition-all">
                Read <ArrowRight size={10} />
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-8 text-center sm:hidden">
          <Link href="/playbook" className="btn-outline text-sm">
            View all guides <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}
