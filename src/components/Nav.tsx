'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { X, Menu } from 'lucide-react';

const LOGO_URL = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/d853d50b-40d4-47f4-ac80-7058a2387dac.png';

const NAV_LINKS = [
  { label: 'Smart Hiring System™', href: '/smart-hiring-system' },
  { label: 'PolicySafe™',          href: '/policysafe' },
  { label: 'DealReady People™',    href: '/dealready-people' },
  { label: 'Services',             href: '/services' },
  { label: 'About',                href: '/about' },
];

export default function Nav() {
  const [open,     setOpen]     = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close drawer on route change
  useEffect(() => { setOpen(false); }, []);

  return (
    <>
      <header
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
          background: scrolled
            ? 'rgba(8,7,15,0.92)'
            : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : 'none',
          transition: 'background 0.3s ease, border-color 0.3s ease, backdrop-filter 0.3s ease',
        }}
      >
        <div style={{
          maxWidth: '1280px', margin: '0 auto',
          padding: '0 2rem',
          height: '68px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {/* Logo */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <Image
              src={LOGO_URL}
              alt="Ravello HR"
              width={140}
              height={40}
              style={{ objectFit: 'contain', height: '36px', width: 'auto' }}
              priority
            />
          </Link>

          {/* Desktop nav */}
          <nav
            style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}
            className="hidden-mobile"
          >
            {NAV_LINKS.map(link => (
              <Link key={link.href} href={link.href} className="nav-link">
                {link.label}
              </Link>
            ))}
            <Link href="/contact" className="btn-primary" style={{ padding: '0.625rem 1.5rem', fontSize: '0.875rem' }}>
              Contact
            </Link>
          </nav>

          {/* Mobile hamburger */}
          <button
            onClick={() => setOpen(o => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-primary)', padding: '8px',
              display: 'none',
            }}
            className="show-mobile"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 49,
          background: 'rgba(8,7,15,0.98)',
          backdropFilter: 'blur(16px)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s ease',
          display: 'flex', flexDirection: 'column',
          paddingTop: '80px', paddingBottom: '2rem',
          paddingLeft: '2rem', paddingRight: '2rem',
        }}
      >
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {NAV_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              style={{
                color: 'var(--color-text-secondary)',
                textDecoration: 'none',
                fontFamily: 'var(--font-body)',
                fontSize: '1.125rem',
                fontWeight: 500,
                padding: '0.875rem 0',
                borderBottom: '1px solid var(--color-border)',
                transition: 'color 0.2s ease',
              }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/contact"
          onClick={() => setOpen(false)}
          className="btn-primary"
          style={{ textAlign: 'center', justifyContent: 'center', marginTop: '1.5rem' }}
        >
          Book a scoping call
        </Link>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .hidden-mobile { display: none !important; }
          .show-mobile   { display: flex !important; }
        }
        @media (min-width: 901px) {
          .show-mobile   { display: none !important; }
        }
      `}</style>
    </>
  );
}
