import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, Clock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'People Ops Playbook | HR Guides for Founders and Managers | The People System',
  description:
    'Practical HR guides, scripts, and frameworks for founders, leaders, and managers. No theory, no filler. Just the things that actually work.',
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
    categoryColor: 'pill-purple',
    title: 'Why your best candidates drop off between offer and start date',
    excerpt:
      'The gap between signing and starting is where most hiring damage happens. Here is what to do in those two to four weeks to make sure your new hire actually shows up and stays.',
    readTime: '4 min read',
    tool: { label: 'Get Your Smart Hiring Score', href: '/tools/hiring-score' },
  },
  {
    category: 'hiring',
    categoryLabel: 'Hiring',
    categoryColor: 'pill-purple',
    title: 'The interview scorecard your hiring managers actually need',
    excerpt:
      'One page. Five criteria. Scores not opinions. This is the simplest thing you can do to make interviews consistent and defensible.',
    readTime: '5 min read',
    tool: { label: 'Get Your Smart Hiring Score', href: '/tools/hiring-score' },
  },
  {
    category: 'compliance',
    categoryLabel: 'Compliance',
    categoryColor: 'pill-purple',
    title: 'The 6 things your employment contracts are probably missing',
    excerpt:
      'Most SME contracts were written once and never updated. Here are the clauses that create the most tribunal exposure and exactly how to close each gap.',
    readTime: '6 min read',
    tool: { label: 'Run Your Policy Healthcheck', href: '/tools/policy-healthcheck' },
  },
  {
    category: 'compliance',
    categoryLabel: 'Compliance',
    categoryColor: 'pill-purple',
    title: 'How to handle a grievance without making it worse',
    excerpt:
      'Most grievances escalate because of process failures, not the original issue. This is the sequence that keeps things proportionate and defensible.',
    readTime: '7 min read',
    tool: { label: 'Check Your HR Risk Score', href: '/tools/hr-risk-score' },
  },
  {
    category: 'scripts',
    categoryLabel: 'Manager Scripts',
    categoryColor: 'pill-navy',
    title: 'Word-for-word: how to open a performance conversation',
    excerpt:
      'Most managers delay difficult conversations because they do not know how to open them. Here is the exact wording that works: professional, direct and genuinely fair.',
    readTime: '3 min read',
    tool: { label: 'Check Your HR Risk Score', href: '/tools/hr-risk-score' },
  },
  {
    category: 'scripts',
    categoryLabel: 'Manager Scripts',
    categoryColor: 'pill-navy',
    title: 'How to announce a redundancy without destroying morale',
    excerpt:
      'Redundancy comms done badly creates a retention crisis in the team you\'re keeping. Here are the pitfalls and the script that avoids them.',
    readTime: '5 min read',
    tool: { label: 'Run the DD Checklist', href: '/tools/due-diligence-checklist' },
  },
  {
    category: 'change',
    categoryLabel: 'Change & M&A',
    categoryColor: 'pill-navy',
    title: 'What TUPE actually means for your acquisition (plain English)',
    excerpt:
      'TUPE is one of the most misunderstood areas of employment law. This is the plain-English version: what transfers, what does not and when you genuinely need specialist advice.',
    readTime: '8 min read',
    tool: { label: 'Get the People DD Checklist', href: '/tools/due-diligence-checklist' },
  },
  {
    category: 'change',
    categoryLabel: 'Change & M&A',
    categoryColor: 'pill-navy',
    title: 'The people questions to ask before you sign heads of terms',
    excerpt:
      'Financial DD finds the numbers. People DD finds the problems. These are the 10 questions you need answered before the deal becomes yours.',
    readTime: '6 min read',
    tool: { label: 'Get the People DD Checklist', href: '/tools/due-diligence-checklist' },
  },
];

export default function PlaybookPage() {
  return (
    <div className="pt-28">

      {/* Hero */}
      <section className="section-padding" style={{ background: 'var(--bg)', paddingTop: '5rem', paddingBottom: '4rem' }}>
        <div className="max-w-4xl mx-auto">
          <span className="eyebrow mb-5">People Ops Playbook</span>
          <h1 style={{ fontFamily: 'var(--font-cormorant), serif', fontSize: 'clamp(2.2rem,4vw,3.5rem)', fontWeight: 300, lineHeight: 1.1, letterSpacing: '-0.02em', color: 'var(--ink)', marginBottom: '1rem' }}>
            Straight-talking HR for leaders
          </h1>
          <p className="text-xl max-w-2xl" style={{ color: 'var(--ink-soft)' }}>
            Scripts, frameworks and honest answers on the people challenges that actually slow businesses down.
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
                className="pill pill-navy cursor-pointer whitespace-nowrap hover:bg-[var(--brand-purple)] hover:text-white transition-colors"
              >
                {cat.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Posts grid */}
      <section className="section-padding" style={{ background: 'var(--bg)' }}>
        <div className="container-wide">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <article key={post.title} className="card flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <span className={`pill ${post.categoryColor}`}>{post.categoryLabel}</span>
                  <span className="flex items-center gap-1 text-[var(--ink-soft)] text-xs">
                    <Clock size={12} />{post.readTime}
                  </span>
                </div>
                <h2 className=" font-bold text-lg text-[var(--ink)] mb-2 leading-snug flex-1">
                  {post.title}
                </h2>
                <p className="text-[var(--ink-soft)] text-sm leading-relaxed mb-4">{post.excerpt}</p>
                <div className="border-t border-gray-100 pt-4 mt-auto">
                  <Link
                    href={post.tool.href}
                    className="inline-flex items-center gap-1 text-[var(--brand-purple)] text-xs font-semibold hover:gap-2 transition-all"
                  >
                    {post.tool.label} <ArrowRight size={12} />
                  </Link>
                </div>
              </article>
            ))}

            {/* Coming soon card */}
            <div className="card flex flex-col items-center justify-center text-center border-dashed border-2 border-gray-200 bg-transparent shadow-none">
              <BookOpen className="text-[var(--ink-soft)]/40 mb-3" size={32} />
              <p className="font-semibold text-[var(--ink-soft)] text-sm mb-1">More guides dropping weekly</p>
              <p className="text-[var(--ink-soft)]/60 text-xs mb-4">Get them straight to your inbox. No noise, just genuinely useful content.</p>
              <a
                href="https://tally.so/r/ravello-playbook"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-xs py-2 px-4"
              >
                Subscribe free <ArrowRight size={12} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="section-padding" style={{ background: 'var(--brand-navy)' }}>
        <div className="container-narrow text-center">
          <h2 className=" text-3xl font-bold mb-4">
            Read enough? Good. Let&apos;s talk.
          </h2>
          <p className="text-white/70 text-lg mb-8 max-w-lg mx-auto">
            If something in the Playbook has resonated, book 15 minutes with Lucinda. Bring your specific situation and leave with a clear, practical path forward.
          </p>
          <Link href="/book" className="btn-primary">
            Book the HR Hotline <ArrowRight size={18} />
          </Link>
        </div>
      </section>

    </div>
  );
}
