'use client';
import Link from 'next/link';
import Image from 'next/image';
import { Mail, Phone, Linkedin, ExternalLink } from 'lucide-react';

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';

export default function Footer() {
  return (
    <footer className="relative overflow-hidden scan-lines" style={{ background: 'var(--brand-navy)' }}>
      {/* Gradient top line */}
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'var(--gradient)' }} />

      {/* Ambient glows */}
      <div
        className="absolute top-0 right-0 w-[600px] h-[500px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 80% 10%, rgba(124,58,237,0.12) 0%, transparent 60%)' }}
      />
      <div
        className="absolute bottom-0 left-0 w-[400px] h-[400px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 10% 90%, rgba(59,111,255,0.08) 0%, transparent 60%)' }}
      />

      <div className="relative z-10 container-wide section-padding">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">

          {/* Brand column */}
          <div className="lg:col-span-1">
            <Link href="/" className="flex items-center mb-3">
              <Image
                src={LOGO}
                alt="The People System"
                width={480}
                height={160}
                className="object-contain h-[110px] w-auto"
              />
            </Link>
            <p className="text-sm leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Your People Department.<br />
              Proper HR. Real outcomes. No generic advice.
            </p>
            <div className="flex gap-3">
              <a
                href="https://www.linkedin.com/company/the-people-system"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-icon-link"
                aria-label="LinkedIn"
              >
                <Linkedin size={14} />
              </a>
              <a
                href="mailto:info@thepeoplesystem.co.uk"
                className="footer-icon-link"
                aria-label="Email"
              >
                <Mail size={14} />
              </a>
            </div>
          </div>

          {/* Solutions */}
          <div>
            <h4
              className="text-[10px] font-bold uppercase tracking-[0.20em] mb-5"
              style={{ color: 'rgba(255,255,255,0.30)' }}
            >
              Solutions
            </h4>
            <ul className="space-y-3">
              {[
                ['Smart Hiring System™', '/smart-hiring-system'],
                ['PolicySafe™',          '/policysafe'],
                ['DealReady People™',    '/dealready-people'],
                ['Change Management',    '/dealready-people#change'],
              ].map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="footer-link text-sm">{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Free Tools */}
          <div>
            <h4
              className="text-[10px] font-bold uppercase tracking-[0.20em] mb-5"
              style={{ color: 'rgba(255,255,255,0.30)' }}
            >
              Free Tools
            </h4>
            <ul className="space-y-3">
              {[
                ['Smart Hiring Score',   '/tools/hiring-score'],
                ['HR Risk Score',        '/tools/hr-risk-score'],
                ['Policy Healthcheck',   '/tools/policy-healthcheck'],
                ['DD Checklist',         '/tools/due-diligence-checklist'],
                ['People Ops Playbook',  '/playbook'],
              ].map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="footer-link text-sm">{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Get Started */}
          <div>
            <h4
              className="text-[10px] font-bold uppercase tracking-[0.20em] mb-5"
              style={{ color: 'rgba(255,255,255,0.30)' }}
            >
              Get Started
            </h4>
            <ul className="space-y-3 mb-6">
              <li>
                <Link href="/book" className="footer-link text-sm flex items-center gap-2">
                  <Phone size={12} /> Book a Free Call
                </Link>
              </li>
              <li>
                <a href="mailto:info@thepeoplesystem.co.uk" className="footer-link text-sm flex items-center gap-2">
                  <Mail size={12} /> info@thepeoplesystem.co.uk
                </a>
              </li>
              <li>
                <a
                  href="https://www.portal.thepeoplesystem.co.uk"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="footer-link text-sm flex items-center gap-2"
                >
                  <ExternalLink size={12} /> Client Portal
                </a>
              </li>
            </ul>

            {/* HR Hotline card */}
            <div
              className="rounded-[14px] p-4 relative overflow-hidden"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(124,58,237,0.20)',
              }}
            >
              <div
                className="absolute top-0 left-0 right-0 h-[1.5px]"
                style={{ background: 'var(--gradient)' }}
              />
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: 'rgba(166,125,255,0.7)' }}>
                HR Hotline
              </p>
              <p className="text-sm font-semibold text-white mb-3 leading-snug">
                30 minutes. No pitch.<br />Leave with a clear plan.
              </p>
              <Link
                href="/book"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-xs font-semibold text-white transition-all duration-200"
                style={{
                  background: 'linear-gradient(135deg, #EA3DC4 0%, #7C3AED 50%, #3B6FFF 100%)',
                  boxShadow: '0 2px 14px rgba(124,58,237,0.35)',
                }}
              >
                Book Now
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="mt-14 pt-7 flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
            &copy; {new Date().getFullYear()} The People System. All rights reserved. Registered in England &amp; Wales.
          </p>
          <div className="flex gap-6">
            {[['Privacy Policy', '/privacy'], ['Terms', '/terms']].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="text-[11px] transition-colors duration-150"
                style={{ color: 'rgba(255,255,255,0.28)' }}
                onMouseOver={(e) => ((e.target as HTMLElement).style.color = 'rgba(255,255,255,0.65)')}
                onMouseOut={(e) => ((e.target as HTMLElement).style.color = 'rgba(255,255,255,0.28)')}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .footer-icon-link {
          width: 34px; height: 34px;
          border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.5);
          border: 1px solid rgba(255,255,255,0.08);
          transition: background 0.2s, color 0.2s, border-color 0.2s;
        }
        .footer-icon-link:hover {
          background: rgba(124,58,237,0.25);
          color: rgba(166,125,255,0.9);
          border-color: rgba(124,58,237,0.3);
        }
        .footer-link {
          color: rgba(255,255,255,0.48);
          transition: color 0.15s;
        }
        .footer-link:hover { color: rgba(255,255,255,0.85); }
      `}</style>
    </footer>
  );
}
