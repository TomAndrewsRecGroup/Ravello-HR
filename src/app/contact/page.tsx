import type { Metadata } from 'next';
import { Mail, Clock, MapPin } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Book a free consultation with Ravello or submit a role for hiring support. UK-based HR and hiring for businesses of 10–250 people.',
};

export default function ContactPage() {
  return (
    <main className="pt-[70px]">

      {/* Hero */}
      <section className="section-padding section-light">
        <div className="container-mid text-center">
          <p className="eyebrow mb-4">Get in touch</p>
          <h1 className="display-xl mb-6" style={{ color: 'var(--ink)' }}>
            Let&apos;s talk about<br className="hidden sm:block" /> your business.
          </h1>
          <p className="text-lg leading-relaxed max-w-[480px] mx-auto" style={{ color: 'var(--ink-soft)' }}>
            Whether you need HR support, want to talk about hiring, or just want to understand what
            Ravello covers — the first conversation is always free.
          </p>
        </div>
      </section>

      {/* Forms */}
      <section className="section-padding section-alt">
        <div className="container-wide">
          <div className="grid lg:grid-cols-2 gap-10">

            {/* Consultation form */}
            <div
              className="rounded-[24px] p-8"
              style={{ background: 'var(--surface)', border: '1px solid var(--brand-line)', boxShadow: '0 2px 20px rgba(14,22,51,0.06)' }}
            >
              <p className="eyebrow mb-3">Free consultation</p>
              <h2 className="font-display font-bold text-[1.5rem] mb-2" style={{ color: 'var(--ink)' }}>
                Book a 30-minute call
              </h2>
              <p className="text-sm mb-7" style={{ color: 'var(--ink-soft)' }}>
                Tell us about your business and what you&apos;re trying to solve. We&apos;ll map out exactly what Ravello covers for you.
              </p>

              <form
                method="POST"
                action="https://formspree.io/f/xvgpbnyj"
                className="space-y-4"
              >
                <div>
                  <label className="input-label">Your name</label>
                  <input type="text" name="name" required className="input" placeholder="Jane Smith" />
                </div>
                <div>
                  <label className="input-label">Work email</label>
                  <input type="email" name="email" required className="input" placeholder="jane@company.co.uk" />
                </div>
                <div>
                  <label className="input-label">Business name</label>
                  <input type="text" name="company" required className="input" placeholder="Your company" />
                </div>
                <div>
                  <label className="input-label">Team size (approx)</label>
                  <select name="team_size" className="input" defaultValue="">
                    <option value="" disabled>Select size</option>
                    <option>10–24 people</option>
                    <option>25–49 people</option>
                    <option>50–99 people</option>
                    <option>100–250 people</option>
                    <option>250+ people</option>
                  </select>
                </div>
                <div>
                  <label className="input-label">What&apos;s the main challenge you&apos;re facing?</label>
                  <textarea
                    name="challenge"
                    rows={3}
                    className="input"
                    placeholder="HR support, a specific hire, compliance — anything on your mind."
                  />
                </div>
                <button type="submit" className="btn-cta w-full justify-center">
                  Request a consultation
                </button>
              </form>
            </div>

            {/* Submit a role form */}
            <div
              id="submit-role"
              className="rounded-[24px] p-8"
              style={{ background: 'var(--surface)', border: '1px solid var(--brand-line)', boxShadow: '0 2px 20px rgba(14,22,51,0.06)' }}
            >
              <p className="eyebrow mb-3">Hiring</p>
              <h2 className="font-display font-bold text-[1.5rem] mb-2" style={{ color: 'var(--ink)' }}>
                Submit a role requirement
              </h2>
              <p className="text-sm mb-7" style={{ color: 'var(--ink-soft)' }}>
                Tell us about the role. Ravello will match it to the right specialist recruiter in our partner network and come back to you.
              </p>

              <form
                method="POST"
                action="https://formspree.io/f/xvgpbnyj"
                className="space-y-4"
              >
                <input type="hidden" name="_subject" value="Role Submission — Ravello" />
                <div>
                  <label className="input-label">Your name</label>
                  <input type="text" name="name" required className="input" placeholder="Jane Smith" />
                </div>
                <div>
                  <label className="input-label">Work email</label>
                  <input type="email" name="email" required className="input" placeholder="jane@company.co.uk" />
                </div>
                <div>
                  <label className="input-label">Role title</label>
                  <input type="text" name="role" required className="input" placeholder="e.g. Head of Operations" />
                </div>
                <div>
                  <label className="input-label">Seniority level</label>
                  <select name="seniority" className="input" defaultValue="">
                    <option value="" disabled>Select level</option>
                    <option>Junior / Graduate</option>
                    <option>Mid-level</option>
                    <option>Senior</option>
                    <option>Head of / Director</option>
                    <option>C-suite / Executive</option>
                  </select>
                </div>
                <div>
                  <label className="input-label">Approximate salary range</label>
                  <input type="text" name="salary" className="input" placeholder="e.g. £55,000–£65,000" />
                </div>
                <div>
                  <label className="input-label">Anything else we should know?</label>
                  <textarea
                    name="notes"
                    rows={3}
                    className="input"
                    placeholder="Timeline, must-haves, context about the team…"
                  />
                </div>
                <button type="submit" className="btn-primary w-full justify-center">
                  Submit role
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Contact info */}
      <section className="section-sm section-dark">
        <div className="container-mid">
          <div className="grid sm:grid-cols-3 gap-6 text-center">
            {[
              { icon: Mail,    label: 'Email',           val: 'hello@ravellohr.co.uk' },
              { icon: Clock,   label: 'Response time',   val: 'Within 1 business day' },
              { icon: MapPin,  label: 'Based in',        val: 'United Kingdom' },
            ].map((c) => (
              <div key={c.label} className="flex flex-col items-center gap-2">
                <c.icon size={18} style={{ color: 'var(--brand-purple)' }} />
                <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {c.label}
                </p>
                <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  {c.val}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
