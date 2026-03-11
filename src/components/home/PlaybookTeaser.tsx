import Link from 'next/link';
import { BookOpen, ArrowRight } from 'lucide-react';

const posts = [
  {
    slug: 'hiring-manager-scorecard',
    tag: 'Hiring',
    tagBg: 'bg-brand-teal/10 text-brand-teal',
    title: 'The Hiring Manager Scorecard That Ends Gut-Feel Interviews',
    excerpt: 'Most hiring mistakes happen before the first interview. Here\'s the scorecard your managers actually need.',
    tool: { label: 'Get your Hiring Score', href: '/tools/hiring-score' },
    readTime: '4 min read',
  },
  {
    slug: 'redundancy-comms-pitfalls',
    tag: 'Change',
    tagBg: 'bg-brand-gold/10 text-brand-gold',
    title: '5 Redundancy Communication Mistakes That Turn Legal Risk Into Headlines',
    excerpt: 'One poorly worded email in a redundancy process can cost six figures. These are the pitfalls we\'ve seen first-hand.',
    tool: { label: 'Download Due Diligence Checklist', href: '/tools/due-diligence-checklist' },
    readTime: '5 min read',
  },
  {
    slug: 'difficult-conversations-scripts',
    tag: 'Management',
    tagBg: 'bg-brand-navy/10 text-brand-navy',
    title: 'Scripts for Difficult Conversations Every Manager Avoids (But Shouldn\'t)',
    excerpt: 'Performance, absence, behaviour. Three word-for-word scripts that protect you and respect the employee.',
    tool: { label: 'Check your HR Risk Score', href: '/tools/hr-risk-score' },
    readTime: '6 min read',
  },
];

export default function PlaybookTeaser() {
  return (
    <section className="section-padding bg-brand-offwhite">
      <div className="container-wide">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-12">
          <div>
            <p className="text-brand-teal text-sm font-semibold uppercase tracking-widest mb-2">
              People Ops Playbook
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-brand-navy">
              No-fluff HR insights
            </h2>
          </div>
          <Link
            href="/playbook"
            className="flex items-center gap-2 text-brand-teal font-semibold hover:gap-3 transition-all"
          >
            <BookOpen size={18} /> View all posts <ArrowRight size={16} />
          </Link>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/playbook/${post.slug}`}
              className="card group hover:border-brand-teal/30"
            >
              <div className="flex items-center justify-between mb-4">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${post.tagBg}`}>
                  {post.tag}
                </span>
                <span className="text-brand-slate text-xs">{post.readTime}</span>
              </div>
              <h3 className="font-display font-bold text-brand-navy text-lg mb-3 group-hover:text-brand-teal transition-colors">
                {post.title}
              </h3>
              <p className="text-brand-slate text-sm leading-relaxed mb-4">{post.excerpt}</p>
              <div className="mt-auto pt-4 border-t border-gray-100">
                <span className="text-brand-teal text-xs font-semibold flex items-center gap-1">
                  {post.tool.label} <ArrowRight size={12} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
