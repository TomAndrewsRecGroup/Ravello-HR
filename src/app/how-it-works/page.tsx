import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight, ClipboardList, Users, LayoutDashboard,
  Headphones, FileCheck, BellRing,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'How It Works',
  description:
    'See how Ravello delivers HR support, structured hiring, and client portal visibility for businesses of 10–250 people.',
};

const onboardingSteps = [
  {
    num: '01',
    title: 'Initial consultation',
    body: 'We learn about your business — size, structure, current HR setup, and the immediate challenges you\'re facing. This takes 30–45 minutes and shapes everything that follows.',
  },
  {
    num: '02',
    title: 'Scope and setup',
    body: 'We agree what Ravello covers for your business: HR support scope, any active roles to hire for, and the documents or processes to prioritise. Your portal is set up and access granted.',
  },
  {
    num: '03',
    title: 'You go live',
    body: 'Your portal is live. HR support is active. If you have roles to fill, the first briefing call with your Ravello hiring lead is booked. You have a named contact from day one.',
  },
];

const hiringSteps = [
  {
    icon: ClipboardList,
    title: 'Submit a requirement',
    body: 'Use the portal to submit a structured hiring brief — role, seniority, must-haves, timeline, and any context about the team or business.',
  },
  {
    icon: Users,
    title: 'Ravello coordinates sourcing',
    body: 'We match your requirement to the right specialist recruiter in our partner network. They source and screen. You don\'t manage multiple agencies.',
  },
  {
    icon: FileCheck,
    title: 'Review qualified candidates',
    body: 'Candidates appear in your portal with a summary, CV, and recruiter notes. You review, approve, reject, or request more information.',
  },
  {
    icon: LayoutDashboard,
    title: 'Track through to hire',
    body: 'The pipeline moves through stages in your portal: Submitted → In Progress → Shortlist Ready → Interview → Offer → Filled. Full visibility throughout.',
  },
];

const portalModules = [
  {
    icon: LayoutDashboard,
    title: 'Dashboard',
    body: 'See active HR items, hiring activity, upcoming deadlines, and recent updates at a glance.',
    accent: 'var(--brand-purple)',
  },
  {
    icon: ClipboardList,
    title: 'Hiring Module',
    body: 'Submit roles, track pipeline stages, review candidates, and give feedback — all in one place.',
    accent: 'var(--brand-blue)',
  },
  {
    icon: FileCheck,
    title: 'Document Management',
    body: 'Upload, store, categorise, and version-control HR documents. Contracts, policies, and letters — accessible when you need them.',
    accent: 'var(--brand-teal)',
  },
  {
    icon: Headphones,
    title: 'Support Requests',
    body: 'Raise HR queries and track them through to resolution. No lost emails, no chasing.',
    accent: 'var(--brand-pink)',
  },
  {
    icon: BellRing,
    title: 'Compliance Alerts',
    body: 'Get notified about expiring documents, upcoming reviews, and compliance deadlines before they become problems.',
    accent: 'var(--brand-purple)',
  },
];

export default function HowItWorksPage() {
  return (
    <main className="pt-[70px]">

      {/* Hero */}
      <section className="section-padding section-light">
        <div className="container-mid text-center">
          <p className="eyebrow mb-4">How Ravello works</p>
          <h1 className="display-xl mb-6" style={{ color: 'var(--ink)' }}>
            From onboarding to<br className="hidden sm:block" /> fully operational in days.
          </h1>
          <p className="text-lg leading-relaxed max-w-[560px] mx-auto" style={{ color: 'var(--ink-soft)' }}>
            Ravello is not a consultancy project. It&apos;s a system you plug into — HR support, hiring
            capability, and a portal for visibility — all activated from a single onboarding.
          </p>
        </div>
      </section>

      {/* Onboarding */}
      <section className="section-padding section-alt">
        <div className="container-wide">
          <div className="mb-14">
            <p className="eyebrow mb-3">Getting started</p>
            <h2 className="display-lg" style={{ color: 'var(--ink)' }}>Onboarding in three steps.</h2>
          </div>
          <div className="grid lg:grid-cols-3 gap-6">
            {onboardingSteps.map((s) => (
              <div key={s.num} className="card-feature">
                <span
                  className="font-display font-bold text-[2.5rem] leading-none"
                  style={{ color: 'rgba(143,114,246,0.2)' }}
                >
                  {s.num}
                </span>
                <div>
                  <h3 className="font-display font-bold text-[1.1rem] mb-2" style={{ color: 'var(--ink)' }}>
                    {s.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Hiring flow */}
      <section id="hiring" className="section-padding section-dark">
        <div className="container-wide">
          <div className="mb-14">
            <p className="eyebrow-light mb-3">Hiring capability</p>
            <h2 className="display-lg text-white mb-4">How structured hiring works.</h2>
            <p className="text-base max-w-[540px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Ravello works with a network of specialist recruiters. Submit a requirement and we
              coordinate the search on your behalf — giving you access to top recruitment expertise
              without managing multiple agencies.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {hiringSteps.map((s, i) => (
              <div key={s.title} className="card-dark flex flex-col gap-4 p-6">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                    style={{ background: 'rgba(143,114,246,0.15)', border: '1px solid rgba(143,114,246,0.2)' }}
                  >
                    <s.icon size={15} style={{ color: 'var(--brand-purple)' }} />
                  </div>
                  <span
                    className="font-display font-bold text-xl"
                    style={{ color: 'rgba(143,114,246,0.4)' }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-2 text-sm">{s.title}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Portal */}
      <section id="portal" className="section-padding section-light">
        <div className="container-wide">
          <div className="mb-14">
            <p className="eyebrow mb-3">Client portal</p>
            <h2 className="display-lg mb-4" style={{ color: 'var(--ink)' }}>
              Everything in one workspace.
            </h2>
            <p className="text-base max-w-[520px]" style={{ color: 'var(--ink-soft)' }}>
              Every Ravello client gets a private portal. It replaces the inbox threads, shared drives,
              and spreadsheets that most businesses run HR on.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {portalModules.map((m) => (
              <div key={m.title} className="card-feature">
                <div
                  className="w-10 h-10 rounded-[12px] flex items-center justify-center"
                  style={{
                    background: `color-mix(in srgb, ${m.accent} 12%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${m.accent} 18%, var(--brand-line))`,
                  }}
                >
                  <m.icon size={17} style={{ color: m.accent }} />
                </div>
                <div>
                  <h3 className="font-semibold text-[1rem] mb-1.5" style={{ color: 'var(--ink)' }}>{m.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{m.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding section-alt">
        <div className="container-narrow text-center">
          <h2 className="display-md mb-5" style={{ color: 'var(--ink)' }}>
            Ready to get started?
          </h2>
          <p className="text-base leading-relaxed mb-8" style={{ color: 'var(--ink-soft)' }}>
            Book a free consultation and we&apos;ll scope out what Ravello looks like for your business.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/contact" className="btn-cta">
              Book a Free Consultation <ArrowRight size={15} />
            </Link>
            <Link href="/contact#submit-role" className="btn-secondary">
              Submit a Role
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
