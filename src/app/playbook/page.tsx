import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, Clock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'People Ops Playbook | No-Fluff HR Guides | Ravello HR',
  description:
    'Practical HR guides, scripts and frameworks for leaders and managers. No theory. No filler. Just what works.',
  alternates: { canonical: 'https://ravellohr.co.uk/playbook' },
};

const categories = [
  { label: 'All', value: 'all' },
  { label: 'Hiring', value: 'hiring' },
  { label: 'Compliance', value: 'compliance' },
  { label: 'Change & M\u0026A', value: 'change' },
  { label: 'Manager Scripts', value: 'scripts' },
];

const posts = [
  {
    category: 'hiring',
    categoryLabel: 'Hiring',
    categoryColor: 'bg-brand-teal text-white',
    title: 'Why your best candidates drop off between offer and start date',
    excerpt:
      'The gap between signing and starting is where most hiring damage happens. Here\'s what to do in those 2\u20134 weeks to make sure they actually show up.',
    readTime: '4 min read',
    tool: { label: 'Get Your Smart Hiring Score', href: '/tools/hiring-score' },
  },
  {
    category: 'hiring',
    categoryLabel: 'Hiring',
    categoryColor: 'bg-brand-teal text-white',
    title: 'The interview scorecard your hiring managers actually need',
    excerpt:
      'One page. Five criteria. Scores not opinions. This is the simplest thing you can do to make interviews consistent and defensible.',
    readTime: '5 min read',
    tool: { label: 'Get Your Smart Hiring Score', href: '/tools/hiring-score' },
  },
  {
    category: 'compliance',
    categoryLabel: 'Compliance',
    categoryColor: 'bg-brand-gold text-white',
    title: 'The 6 things your employment contracts are probably missing',
    excerpt:
      'Most SME contracts were written once and never updated. Here are the clauses that create the most tribunal exposure \u2014 and how to close them.',
    readTime: '6 min read',
    tool: { label: 'Run Your Policy Healthcheck', href: '/tools/policy-healthcheck' },
  },
  {
    category: 'compliance',
    categoryLabel: 'Compliance',
    categoryColor: 'bg-brand-gold text-white',
    title: 'How to handle a grievance without making it worse',
    excerpt:
      'Most grievances escalate because of process failures, not the original issue. This is the sequence that keeps things proportionate and defensible.',
    readTime: '7 min read',
    tool: { label: 'Check Your HR Risk Score', href: '/tools/hr-risk-score' },
  },
  {
    category: 'scripts',
    categoryLabel: 'Manager Scripts',
    categoryColor: 'bg-brand-navy text-white',
    title: 'Word-for-word: how to open a performance conversation',
    excerpt:
      'Most managers delay difficult conversations because they don\'t know how to start. Here\'s the exact opening that works \u2014 professional, direct and fair.',
    readTime: '3 min read',
    tool: { label: 'Check Your HR Risk Score', href: '/tools/hr-risk-score' },
  },
  {
    category: 'scripts',
    categoryLabel: 'Manager Scripts',
    categoryColor: 'bg-brand-navy text-white',
    title: 'How to announce a redundancy without destroying morale',
    excerpt:
      'Redundancy comms done badly creates a retention crisis in the team you\'re keeping. Here are the pitfalls and the script that avoids them.',
    readTime: '5 min read',
    tool: { label: 'Run the DD Checklist', href: '/tools/due-diligence-checklist' },
  },
  {
    category: 'change',
    categoryLabel: 'Change & M&A',
    categoryColor: 'bg-brand-slate text-white',
    title: 'What TUPE actually means for your acquisition (plain English)',
    excerpt:
      'TUPE is one of the most misunderstood areas of employment law. This is the non-lawyer version \u2014 what transfers, what doesn\'t, and when you need help.',
    readTime: '8 min read',
    tool: { label: 'Get the People DD Checklist', href: '/tools/due-diligence-checklist' },
  },
  {
    category: 'change',
    categoryLabel: 'Change & M&A',
    categoryColor: 'bg-brand-slate text-white',
    title: 'The people questions to ask before you sign heads of terms',
    excerpt:
      'Financial DD finds the numbers. People DD finds the problems. These are the 10 questions you need answered before the deal becomes yours.',
    readTime: '6 min read',
    tool: { label: 'Get the People DD Checklist', href: '/tools/due-diligence-checklist' },
  },
];

export default function PlaybookPage() {
  return (
    <div className="pt-20">

      {/* Hero */}
      <section className="gradient-hero text-white py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <span className="funnel-tag bg-white/20 border border-white/30 text-white mb-6 inline-block">People Ops Playbook</span>
          <h1 className="font-display text-4xl lg:text-5xl font-bold mb-4">
            No-fluff HR for leaders
          </h1>
          <p className="text-white/80 text-xl max-w-2xl">
            Scripts, frameworks and straight answers on the people challenges that actually slow businesses down.
          </p>
        </div>
      </section>

      {/* Category filter (static — can be made dynamic later) */}
      <section className="bg-white border-b border-gray-100 sticky top-16 z-30">
        <div className="container-wide px-4 sm:px-6 lg:px-8">
          <div className="flex gap-2 overflow-x-auto py-3 scrollbar-hide">
            {categories.map((cat) => (
              <span
                key={cat.value}
                className="funnel-tag bg-brand-light text-brand-navy cursor-pointer whitespace-nowrap hover:bg-brand-teal hover:text-white transition-colors"
              >
                {cat.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Posts grid */}
      <section className="section-padding bg-brand-offwhite">
        <div className="container-wide">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <article key={post.title} className="card flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <span className={`funnel-tag text-xs ${post.categoryColor}`}>{post.categoryLabel}</span>
                  <span className="flex items-center gap-1 text-brand-slate text-xs">
                    <Clock size={12} />{post.readTime}
                  </span>
                </div>
                <h2 className="font-display font-bold text-lg text-brand-navy mb-2 leading-snug flex-1">
                  {post.title}
                </h2>
                <p className="text-brand-slate text-sm leading-relaxed mb-4">{post.excerpt}</p>
                <div className="border-t border-gray-100 pt-4 mt-auto">
                  <Link
                    href={post.tool.href}
                    className="inline-flex items-center gap-1 text-brand-teal text-xs font-semibold hover:gap-2 transition-all"
                  >
                    {post.tool.label} <ArrowRight size={12} />
                  </Link>
                </div>
              </article>
            ))}

            {/* Coming soon card */}
            <div className="card flex flex-col items-center justify-center text-center border-dashed border-2 border-gray-200 bg-transparent shadow-none">
              <BookOpen className="text-brand-slate/40 mb-3" size={32} />
              <p className="font-semibold text-brand-slate text-sm mb-1">More guides coming weekly</p>
              <p className="text-brand-slate/60 text-xs mb-4">Get them in your inbox — no noise, just useful.</p>
              <a
                href="https://tally.so/r/ravello-playbook"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline text-xs py-2 px-4"
              >
                Subscribe free <ArrowRight size={12} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="section-padding bg-brand-navy text-white">
        <div className="container-narrow text-center">
          <h2 className="font-display text-3xl font-bold mb-4">
            Read enough? Let’s talk.
          </h2>
          <p className="text-white/70 text-lg mb-8 max-w-lg mx-auto">
            If something in the Playbook has landed, book 15 minutes. Bring the specific situation and leave with a clear path.
          </p>
          <Link href="/book" className="btn-primary">
            Book the HR Hotline <ArrowRight size={18} />
          </Link>
        </div>
      </section>

    </div>
  );
}
