import Image from 'next/image';
import Link from 'next/link';
import {
  Briefcase, ShieldCheck, BookOpen, Users, FolderOpen, BarChart3,
  TrendingUp, LifeBuoy, ArrowRight, CheckCircle2,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Briefcase,
    title: 'Hiring Pipeline',
    desc: 'Track every role from brief to offer. Candidate stages, interview schedules, and role scores. One view. No chasing.',
    color: 'var(--brand-purple)',
    bg: 'rgba(124,58,237,0.08)',
  },
  {
    icon: ShieldCheck,
    title: 'Compliance Tracker',
    desc: 'Never miss a deadline. Due dates, status workflows, and overdue alerts by category. Stay ahead, not behind.',
    color: '#28C840',
    bg: 'rgba(40,200,64,0.08)',
  },
  {
    icon: BookOpen,
    title: 'LEAD Module',
    desc: 'Training needs, performance reviews, and a full skills matrix. Develop your people with structure, not guesswork.',
    color: 'var(--brand-blue)',
    bg: 'rgba(59,111,255,0.08)',
  },
  {
    icon: Users,
    title: 'PROTECT Module',
    desc: 'Employee documents, absence management, and an HR dashboard. Headcount, turnover, and diversity. All tracked.',
    color: 'var(--brand-pink)',
    bg: 'rgba(234,61,196,0.08)',
  },
  {
    icon: FolderOpen,
    title: 'Document Library',
    desc: 'Contracts, policies, handbooks. Versioned, organised by category, and always current. Nothing out of date.',
    color: '#8A5500',
    bg: 'rgba(138,85,0,0.08)',
  },
  {
    icon: TrendingUp,
    title: 'Metrics and Analytics',
    desc: 'Hiring performance, compliance health, salary benchmarks. One dashboard that tells you what is actually happening.',
    color: 'var(--brand-purple)',
    bg: 'rgba(124,58,237,0.08)',
  },
  {
    icon: LifeBuoy,
    title: 'Support and Service Requests',
    desc: 'Raise tickets, request HR services, track responses. Everything logged. Nothing dropped.',
    color: 'var(--brand-blue)',
    bg: 'rgba(59,111,255,0.08)',
  },
  {
    icon: BarChart3,
    title: 'Reports and Exports',
    desc: 'Live CSV reports on roles, candidates, compliance, and actions. Ready for board packs or investor updates.',
    color: '#047857',
    bg: 'rgba(4,120,87,0.08)',
  },
];

export default function PortalShowcase() {
  return (
    <section className="section-padding" style={{ background: 'var(--bg)' }}>
      <div className="container-wide">

        {/* Header with stock image */}
        <div className="grid lg:grid-cols-[1fr_480px] gap-14 items-center mb-20">
          <div>
            <p className="eyebrow mb-5">
              <span
                className="w-1.5 h-1.5 rounded-full inline-block mr-2"
                style={{ background: 'var(--brand-purple)', verticalAlign: 'middle' }}
              />
              Your client portal
            </p>
            <h2 className="section-title mb-6">
              Everything your People Department needs. In one place.
            </h2>
            <p className="text-lg leading-relaxed mb-6" style={{ color: 'var(--ink-soft)' }}>
              Every client gets a dedicated portal. Your hiring pipeline, compliance tracker,
              documents, and support requests. All in one place. No chasing updates.
            </p>
            <div className="flex items-start gap-3 mb-3">
              <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--brand-purple)' }} />
              <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>Full visibility across hiring, compliance, and HR. In real time.</span>
            </div>
            <div className="flex items-start gap-3 mb-3">
              <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--brand-purple)' }} />
              <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>Nothing falls through the cracks. Everything is logged.</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--brand-purple)' }} />
              <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>Board-ready reports and exports whenever you need them.</span>
            </div>
          </div>

          {/* Stock image of person using laptop */}
          <div className="hidden lg:block">
            <div className="rounded-[24px] overflow-hidden" style={{ boxShadow: '0 8px 40px rgba(10,15,30,0.08)' }}>
              <Image
                src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=960&h=640&fit=crop&crop=faces"
                alt="Business leader reviewing people analytics on laptop"
                width={480}
                height={320}
                className="w-full h-auto object-cover"
              />
            </div>
          </div>
        </div>

        {/* Feature grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="card group cursor-default"
                style={{ padding: '1.5rem' }}
              >
                <div
                  className="w-11 h-11 rounded-[14px] flex items-center justify-center mb-4"
                  style={{ background: f.bg }}
                >
                  <Icon size={20} style={{ color: f.color }} />
                </div>
                <h4
                  className="font-bold text-[0.95rem] mb-2 leading-snug"
                  style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
                >
                  {f.title}
                </h4>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                  {f.desc}
                </p>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="text-center mt-14">
          <Link href="/book" className="btn-gradient">
            See the portal in action <ArrowRight size={15} />
          </Link>
        </div>

      </div>
    </section>
  );
}
