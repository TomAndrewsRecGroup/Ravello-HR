'use client';
import Link from 'next/link';
import Image from 'next/image';
import { CalendarCheck, ArrowRight, CheckCircle2 } from 'lucide-react';

const LOGO_FULL = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';

const PAIN_POINTS = [
  'No dedicated People lead, so managers are winging it',
  'Hiring on repeat with the same roles and same agency bills',
  'Compliance gaps you can\'t currently see',
  'HR documents that haven\'t been touched in years',
];

export default function Hero() {
  return (
    <section
      className="relative overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      {/* Subtle warm gradient wash */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 30% 20%, rgba(124,58,237,0.04) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 container-wide section-padding w-full pt-36 pb-24">

        {/* Centred logo + tagline: above the grid */}
        <div className="flex flex-col items-center text-center mb-14">
          <Image
            src={LOGO_FULL}
            alt="The People System"
            width={560}
            height={180}
            className="object-contain w-auto mb-6"
            style={{ height: '130px' }}
            priority
          />
          <p
            className="text-[11px] font-bold uppercase tracking-[0.22em]"
            style={{ color: 'var(--ink-faint)' }}
          >
            Hire.&nbsp;&nbsp;Lead.&nbsp;&nbsp;Protect.
          </p>
        </div>

        <div className="grid lg:grid-cols-[1fr_460px] gap-12 xl:gap-16 items-center">

          {/* Left column — Company-first messaging */}
          <div>

            <h1
              className="font-display mb-6"
              style={{
                fontSize: 'clamp(3.2rem, 6.5vw, 6rem)',
                fontWeight: 800,
                lineHeight: 1.0,
                letterSpacing: '-0.04em',
                color: 'var(--ink)',
              }}
            >
              <span className="text-gradient">
                The People System
              </span>
            </h1>

            <p
              className="text-lg leading-relaxed mb-4 max-w-[520px]"
              style={{ color: 'var(--ink-soft)' }}
            >
              Hire the right people. Lead your managers. Protect your business.
              One partner. The expertise you need. The portal that keeps you in control.
            </p>

            <p
              className="text-sm leading-relaxed mb-8 max-w-[480px]"
              style={{ color: 'var(--ink-faint)' }}
            >
              Built for senior leaders at growing businesses (10&ndash;150 people) who need
              a proper People function without the full-time headcount cost.
            </p>

            {/* Pain points */}
            <div className="space-y-3 mb-10">
              {PAIN_POINTS.map((p) => (
                <div key={p} className="flex items-start gap-3">
                  <CheckCircle2
                    size={18}
                    className="mt-0.5 flex-shrink-0"
                    style={{ color: 'var(--brand-purple)' }}
                  />
                  <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{p}</span>
                </div>
              ))}
              <p className="text-sm font-bold pl-[30px]" style={{ color: 'var(--ink)' }}>
                Sound familiar? We fix all of it.
              </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4">
              <Link href="/book" className="btn-gradient">
                <CalendarCheck size={16} /> Book a Free Call
              </Link>
              <Link href="/smart-hiring-system" className="btn-secondary">
                See how it works <ArrowRight size={15} />
              </Link>
            </div>

            {/* Stats */}
            <div
              className="flex flex-wrap gap-8 pt-8"
              style={{ borderTop: '1px solid var(--brand-line)' }}
            >
              {STATS.map((m) => (
                <div key={m.lab} className="group">
                  {m.gold ? (
                    /* Gold stat: quality signal */
                    <p
                      className="font-bold text-[2rem] mb-1"
                      style={{
                        fontFamily: 'var(--font-cormorant), "Cormorant Garamond", Georgia, serif',
                        background: 'var(--gold-gloss)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        letterSpacing: '-0.025em',
                        lineHeight: 1,
                      }}
                    >
                      {m.val}
                    </p>
                  ) : (
                    /* Gradient stat */
                    <p
                      className="font-bold text-[2rem] mb-1"
                      style={{
                        fontFamily: 'var(--font-cormorant), "Cormorant Garamond", Georgia, serif',
                        backgroundImage: 'linear-gradient(135deg, #EA3DC4, #7C3AED)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        letterSpacing: '-0.025em',
                        lineHeight: 1,
                      }}
                    >
                      {m.val}
                    </p>
                  )}
                  <p className="text-[11px] font-medium" style={{ color: 'var(--ink-faint)' }}>
                    {m.lab}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right column: score card */}
          <div className="hidden lg:block">
            <div className="relative">
              {/* Browser window frame */}
              <div
                className="rounded-[20px] overflow-hidden"
                style={{
                  border: '1px solid var(--brand-line)',
                  boxShadow: '0 8px 48px rgba(10,15,30,0.10), 0 2px 8px rgba(10,15,30,0.04)',
                }}
              >
                {/* Browser top bar */}
                <div
                  className="flex items-center gap-2 px-4 py-3"
                  style={{ background: 'var(--surface-soft)', borderBottom: '1px solid var(--brand-line)' }}
                >
                  <div className="flex gap-1.5">
                    <span className="w-3 h-3 rounded-full" style={{ background: '#FF5F57' }} />
                    <span className="w-3 h-3 rounded-full" style={{ background: '#FFBD2E' }} />
                    <span className="w-3 h-3 rounded-full" style={{ background: '#28C840' }} />
                  </div>
                  <div
                    className="flex-1 ml-3 px-3 py-1 rounded-md text-[11px] font-medium"
                    style={{ background: 'var(--surface)', color: 'var(--ink-faint)' }}
                  >
                    www.portal.thepeoplesystem.co.uk
                  </div>
                </div>

                {/* Portal mockup content */}
                <div style={{ background: 'var(--bg)', padding: '20px' }}>
                  {/* Mini sidebar + content */}
                  <div className="flex gap-4">
                    {/* Mini sidebar */}
                    <div
                      className="flex-shrink-0 rounded-[12px] p-3"
                      style={{
                        width: '140px',
                        background: 'var(--surface-dark, #050810)',
                      }}
                    >
                      <div className="space-y-1.5">
                        {['Dashboard', 'Hiring', 'LEAD', 'PROTECT', 'Compliance', 'Documents', 'Support', 'Metrics'].map((item, i) => (
                          <div
                            key={item}
                            className="px-2 py-1.5 rounded-md text-[10px] font-medium"
                            style={{
                              color: i === 0 ? '#fff' : 'rgba(255,255,255,0.40)',
                              background: i === 0 ? 'rgba(124,58,237,0.25)' : 'transparent',
                            }}
                          >
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Mini dashboard content */}
                    <div className="flex-1 space-y-3">
                      {/* Stat row */}
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: 'Active Roles', val: '4', color: 'var(--brand-purple)' },
                          { label: 'Compliance', val: '96%', color: '#28C840' },
                          { label: 'Open Actions', val: '7', color: 'var(--brand-blue)' },
                        ].map((s) => (
                          <div
                            key={s.label}
                            className="rounded-[10px] p-3"
                            style={{ background: 'var(--surface)', border: '1px solid var(--brand-line)' }}
                          >
                            <p className="font-mono text-lg font-bold" style={{ color: s.color, letterSpacing: '-0.02em' }}>{s.val}</p>
                            <p className="text-[9px] font-medium" style={{ color: 'var(--ink-faint)' }}>{s.label}</p>
                          </div>
                        ))}
                      </div>

                      {/* Mini table */}
                      <div
                        className="rounded-[10px] p-3"
                        style={{ background: 'var(--surface)', border: '1px solid var(--brand-line)' }}
                      >
                        <p className="text-[10px] font-bold mb-2" style={{ color: 'var(--ink)' }}>Recent Hiring Pipeline</p>
                        <div className="space-y-2">
                          {[
                            { role: 'Senior Developer', stage: 'Interviewing', badge: 'rgba(124,58,237,0.12)', badgeText: '#5A1EC0' },
                            { role: 'Marketing Manager', stage: 'Offer', badge: 'rgba(52,211,153,0.14)', badgeText: '#047857' },
                            { role: 'Finance Analyst', stage: 'Screening', badge: 'rgba(59,111,255,0.12)', badgeText: '#1848CC' },
                          ].map((r) => (
                            <div key={r.role} className="flex items-center justify-between">
                              <span className="text-[10px] font-medium" style={{ color: 'var(--ink-soft)' }}>{r.role}</span>
                              <span
                                className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                                style={{ background: r.badge, color: r.badgeText }}
                              >
                                {r.stage}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Mini compliance bar */}
                      <div
                        className="rounded-[10px] p-3"
                        style={{ background: 'var(--surface)', border: '1px solid var(--brand-line)' }}
                      >
                        <p className="text-[10px] font-bold mb-2" style={{ color: 'var(--ink)' }}>Compliance Tracker</p>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-alt)' }}>
                            <div className="h-full rounded-full" style={{ width: '96%', background: '#28C840' }} />
                          </div>
                          <span className="text-[10px] font-bold" style={{ color: '#047857' }}>96%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Feature pills positioned outside the mockup edges */}
              <div
                className="absolute -left-16 top-[18%] px-3 py-1.5 rounded-full text-[11px] font-bold"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--brand-line)',
                  boxShadow: '0 4px 16px rgba(10,15,30,0.08)',
                  color: 'var(--brand-purple)',
                }}
              >
                Hiring Pipeline
              </div>
              <div
                className="absolute -right-14 top-[12%] px-3 py-1.5 rounded-full text-[11px] font-bold"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--brand-line)',
                  boxShadow: '0 4px 16px rgba(10,15,30,0.08)',
                  color: 'var(--brand-blue)',
                }}
              >
                HR Documents
              </div>
              <div
                className="absolute -left-14 bottom-[15%] px-3 py-1.5 rounded-full text-[11px] font-bold"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--brand-line)',
                  boxShadow: '0 4px 16px rgba(10,15,30,0.08)',
                  color: '#047857',
                }}
              >
                Compliance 96%
              </div>
              <div
                className="absolute -right-16 bottom-[30%] px-3 py-1.5 rounded-full text-[11px] font-bold"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--brand-line)',
                  boxShadow: '0 4px 16px rgba(10,15,30,0.08)',
                  color: 'var(--brand-pink)',
                }}
              >
                Salary Benchmarks
              </div>
              <div
                className="absolute -right-10 top-[45%] px-3 py-1.5 rounded-full text-[11px] font-bold"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--brand-line)',
                  boxShadow: '0 4px 16px rgba(10,15,30,0.08)',
                  color: '#8A5500',
                }}
              >
                Performance Reviews
              </div>
              <div
                className="absolute -left-12 top-[52%] px-3 py-1.5 rounded-full text-[11px] font-bold"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--brand-line)',
                  boxShadow: '0 4px 16px rgba(10,15,30,0.08)',
                  color: 'var(--brand-blue)',
                }}
              >
                Absence Tracking
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
