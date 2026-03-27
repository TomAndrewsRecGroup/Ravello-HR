'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X, ChevronDown, CalendarCheck, LogIn } from 'lucide-react';

const LOGO_MARK = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/d853d50b-40d4-47f4-ac80-7058a2387dac.png';

const solutions = [
  { href: '/hire',          label: 'HIRE',          sub: 'Recruitment & talent delivery', dot: 'var(--brand-purple)' },
  { href: '/lead',          label: 'LEAD',          sub: 'Fractional HR leadership',      dot: '#2E8B7A'             },
  { href: '/protect',       label: 'PROTECT',       sub: 'HR foundations & compliance',   dot: 'var(--brand-blue)'   },
  { href: '/friction-lens', label: 'Friction Lens', sub: 'Role scoring before you recruit', dot: 'var(--brand-pink)' },
];
const tools = [
  { href: '/tools/hiring-score',            label: 'Smart Hiring Score' },
  { href: '/tools/hr-risk-score',           label: 'HR Risk Score' },
  { href: '/tools/policy-healthcheck',      label: 'Policy Healthcheck' },
  { href: '/tools/due-diligence-checklist', label: 'DD Checklist' },
];

export default function Nav() {
  const [open, setOpen]         = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [solOpen, setSol]       = useState(false);
  const [toolOpen, setTool]     = useState(false);

  const solTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openSol  = () => { if (solTimer.current)  clearTimeout(solTimer.current);  setSol(true);  };
  const closeSol = () => { solTimer.current  = setTimeout(() => setSol(false),  150); };

  const openTool  = () => { if (toolTimer.current) clearTimeout(toolTimer.current); setTool(true);  };
  const closeTool = () => { toolTimer.current = setTimeout(() => setTool(false), 150); };

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 32);
    window.addEventListener('scroll', h);
    return () => window.removeEventListener('scroll', h);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/96 backdrop-blur-xl shadow-[0_1px_0_rgba(7,11,29,0.07),0_2px_16px_rgba(7,11,29,0.04)]'
          : 'bg-white/75 backdrop-blur-md'
      }`}
    >
      {/* Top gradient line */}
      <div
        className="absolute top-0 left-0 right-0 h-[1.5px]"
        style={{ background: 'var(--gradient)' }}
      />

      <nav className="container-wide px-6 lg:px-10">
        <div className="flex items-center justify-between h-[76px]">

          {/* Logo */}
          <Link href="/" className="flex items-center flex-shrink-0 focus-ring">
            <Image
              src={LOGO_MARK}
              alt="The People System"
              width={58}
              height={58}
              className="h-[52px] w-auto object-contain"
              priority
            />
          </Link>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-0.5">

            {/* Solutions dropdown */}
            <div className="relative" onMouseEnter={openSol} onMouseLeave={closeSol}>
              <button className="btn-ghost flex items-center gap-1.5">
                Solutions
                <ChevronDown
                  size={12}
                  className={`transition-transform duration-200 ${solOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {solOpen && (
                <div
                  className="absolute top-full left-0 mt-2 rounded-[16px] p-2"
                  style={{
                    minWidth: '272px',
                    boxShadow: '0 8px 48px rgba(7,11,29,0.12), 0 2px 8px rgba(7,11,29,0.06)',
                    border: '1px solid var(--brand-line)',
                    background: 'var(--bg)',
                    zIndex: 60,
                    animation: 'slideDown 0.16s ease forwards',
                  }}
                >
                  {solutions.map((s) => (
                    <Link
                      key={s.href}
                      href={s.href}
                      className="flex items-center gap-3 px-4 py-3 rounded-[10px] transition-all duration-150 hover:bg-[var(--surface-alt)] group"
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0 transition-transform duration-150 group-hover:scale-125"
                        style={{ background: s.dot }}
                      />
                      <div>
                        <span className="block text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
                          {s.label}
                        </span>
                        <span className="block text-[11px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                          {s.sub}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Free Tools dropdown */}
            <div className="relative" onMouseEnter={openTool} onMouseLeave={closeTool}>
              <button className="btn-ghost flex items-center gap-1.5">
                Free Tools
                <ChevronDown
                  size={12}
                  className={`transition-transform duration-200 ${toolOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {toolOpen && (
                <div
                  className="absolute top-full left-0 mt-2 rounded-[16px] p-2"
                  style={{
                    minWidth: '228px',
                    boxShadow: '0 8px 48px rgba(7,11,29,0.12), 0 2px 8px rgba(7,11,29,0.06)',
                    border: '1px solid var(--brand-line)',
                    background: 'var(--bg)',
                    zIndex: 60,
                    animation: 'slideDown 0.16s ease forwards',
                  }}
                >
                  {tools.map((t) => (
                    <Link
                      key={t.href}
                      href={t.href}
                      className="block px-4 py-3 rounded-[10px] text-[13px] font-medium transition-colors hover:bg-[var(--surface-alt)]"
                      style={{ color: 'var(--ink-soft)' }}
                    >
                      {t.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Link href="/playbook"    className="btn-ghost">Playbook</Link>
            <Link href="/why-ravello" className="btn-ghost">Why TPO</Link>
            <Link href="/about"       className="btn-ghost">About</Link>

            {/* Divider */}
            <div className="w-px h-5 mx-2" style={{ background: 'var(--brand-line)' }} />

            {/* Client Portal */}
            <a
              href="https://portal.ravello-hr.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-portal"
            >
              <LogIn size={13} />
              Client Portal
            </a>

            {/* Divider */}
            <div className="w-px h-5 mx-2" style={{ background: 'var(--brand-line)' }} />

            {/* Primary CTA */}
            <Link href="/book" className="btn-gradient">
              <CalendarCheck size={15} /> Get Started
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="lg:hidden p-2 rounded-xl transition-colors hover:bg-[var(--surface-alt)]"
            style={{ color: 'var(--ink)' }}
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile menu */}
        {open && (
          <div
            className="lg:hidden rounded-[18px] p-5 mb-4"
            style={{
              border: '1px solid var(--brand-line)',
              boxShadow: '0 12px 48px rgba(7,11,29,0.12)',
              background: 'var(--bg)',
              zIndex: 60,
              animation: 'slideDown 0.2s ease forwards',
            }}
          >
            <p
              className="text-[10px] font-bold uppercase tracking-widest px-3 mb-2"
              style={{ color: 'var(--ink-faint)' }}
            >
              Solutions
            </p>
            {solutions.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm hover:bg-[var(--surface-alt)] transition-colors"
                style={{ color: 'var(--ink-soft)' }}
                onClick={() => setOpen(false)}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
                <span className="font-medium">{s.label}</span>
              </Link>
            ))}
            <div className="my-3 brand-divider" />
            <p
              className="text-[10px] font-bold uppercase tracking-widest px-3 mb-2"
              style={{ color: 'var(--ink-faint)' }}
            >
              Free Tools
            </p>
            {tools.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="block px-3 py-2.5 rounded-xl text-sm hover:bg-[var(--surface-alt)] transition-colors"
                style={{ color: 'var(--ink-soft)' }}
                onClick={() => setOpen(false)}
              >
                {t.label}
              </Link>
            ))}
            <div className="my-3 brand-divider" />
            <Link href="/playbook"    className="block px-3 py-2.5 rounded-xl text-sm" style={{ color: 'var(--ink-soft)' }} onClick={() => setOpen(false)}>Playbook</Link>
            <Link href="/why-ravello" className="block px-3 py-2.5 rounded-xl text-sm font-semibold" style={{ color: 'var(--brand-purple)' }} onClick={() => setOpen(false)}>Why TPO</Link>
            <Link href="/about"       className="block px-3 py-2.5 rounded-xl text-sm" style={{ color: 'var(--ink-soft)' }} onClick={() => setOpen(false)}>About</Link>
            <div className="my-3 brand-divider" />
            <a
              href="https://portal.ravello-hr.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium"
              style={{ color: 'var(--brand-purple)' }}
              onClick={() => setOpen(false)}
            >
              <LogIn size={14} /> Client Portal Login
            </a>
            <div className="pt-4">
              <Link href="/book" className="btn-gradient w-full" onClick={() => setOpen(false)}>
                <CalendarCheck size={15} /> Get Started
              </Link>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
