import Link from 'next/link';
import Image from 'next/image';
import { Mail, Phone, Linkedin } from 'lucide-react';

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/d853d50b-40d4-47f4-ac80-7058a2387dac.png';

export default function Footer() {
  return (
    <footer style={{ background: 'var(--brand-navy)' }}>
      <div className="container-wide section-padding">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">

          {/* Brand */}
          <div className="lg:col-span-1">
            <Link href="/" className="flex items-center gap-3 mb-5 group">
              <Image
                src={LOGO}
                alt="Ravello HR"
                width={120}
                height={40}
                className="object-contain h-10 w-auto brightness-[1.1]"
              />
            </Link>
            <p className="text-sm leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Strategic HR systems for ambitious businesses. Named systems, not generic advice.
            </p>
            <div className="flex gap-3">
              <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer"
                className="w-9 h-9 rounded-[8px] flex items-center justify-center transition-colors"
                style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)' }}
                onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(143,114,246,0.3)')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
              >
                <Linkedin size={15} />
              </a>
              <a href="mailto:hello@ravellohr.co.uk"
                className="w-9 h-9 rounded-[8px] flex items-center justify-center transition-colors"
                style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)' }}
                onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(143,114,246,0.3)')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
              >
                <Mail size={15} />
              </a>
            </div>
          </div>

          {/* Solutions */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] mb-5" style={{ color: 'rgba(255,255,255,0.35)' }}>Solutions</h4>
            <ul className="space-y-3">
              {[
                ['Smart Hiring System™', '/smart-hiring-system'],
                ['PolicySafe™',           '/policysafe'],
                ['DealReady People™',     '/dealready-people'],
                ['Change Management',      '/dealready-people#change'],
              ].map(([label, href]) => (
                <li key={href}>
                  <Link href={href}
                    className="text-sm transition-colors hover:text-white"
                    style={{ color: 'rgba(255,255,255,0.55)' }}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Free Tools */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] mb-5" style={{ color: 'rgba(255,255,255,0.35)' }}>Free Tools</h4>
            <ul className="space-y-3">
              {[
                ['Smart Hiring Score',       '/tools/hiring-score'],
                ['HR Risk Score',            '/tools/hr-risk-score'],
                ['Policy Healthcheck',       '/tools/policy-healthcheck'],
                ['DD Checklist',             '/tools/due-diligence-checklist'],
                ['People Ops Playbook',      '/playbook'],
              ].map(([label, href]) => (
                <li key={href}>
                  <Link href={href}
                    className="text-sm transition-colors hover:text-white"
                    style={{ color: 'rgba(255,255,255,0.55)' }}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Get Started */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] mb-5" style={{ color: 'rgba(255,255,255,0.35)' }}>Get Started</h4>
            <ul className="space-y-3 mb-6">
              <li>
                <Link href="/book"
                  className="flex items-center gap-2 text-sm transition-colors hover:text-white"
                  style={{ color: 'rgba(255,255,255,0.55)' }}
                >
                  <Phone size={13} /> Book a Free Call
                </Link>
              </li>
              <li>
                <a href="mailto:hello@ravellohr.co.uk"
                  className="flex items-center gap-2 text-sm transition-colors hover:text-white"
                  style={{ color: 'rgba(255,255,255,0.55)' }}
                >
                  <Mail size={13} /> hello@ravellohr.co.uk
                </a>
              </li>
            </ul>

            {/* Hotline card */}
            <div className="rounded-[14px] p-4" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>No-Fluff HR Hotline</p>
              <p className="text-sm font-semibold text-white mb-3">15 mins. Bring your mess. Leave with clarity.</p>
              <Link href="/book"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-xs font-semibold text-white transition-all"
                style={{ background: 'var(--brand-purple)', boxShadow: '0 2px 12px rgba(143,114,246,0.3)' }}
              >
                Book Now
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-14 pt-7 flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            &copy; {new Date().getFullYear()} Ravello HR. All rights reserved. Registered in England & Wales.
          </p>
          <div className="flex gap-6">
            {[['Privacy Policy', '/privacy'], ['Terms', '/terms']].map(([label, href]) => (
              <Link key={href} href={href}
                className="text-xs transition-colors hover:text-white"
                style={{ color: 'rgba(255,255,255,0.3)' }}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
