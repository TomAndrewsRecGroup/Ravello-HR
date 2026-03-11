'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X, ChevronDown } from 'lucide-react';

const solutions = [
  { href: '/smart-hiring-system', label: 'Smart Hiring System™', tag: 'Funnel A', tagColor: 'bg-brand-teal' },
  { href: '/policysafe', label: 'PolicySafe™', tag: 'Funnel B', tagColor: 'bg-brand-gold' },
  { href: '/dealready-people', label: 'DealReady People™', tag: 'Funnel C', tagColor: 'bg-brand-navy' },
];

const tools = [
  { href: '/tools/hiring-score', label: 'Smart Hiring Score' },
  { href: '/tools/hr-risk-score', label: 'HR Risk & Compliance Score' },
  { href: '/tools/policy-healthcheck', label: 'Policy Healthcheck' },
  { href: '/tools/due-diligence-checklist', label: 'Due Diligence Checklist' },
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [solutionsOpen, setSolutionsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-white/95 backdrop-blur-sm shadow-sm' : 'bg-transparent'
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-teal flex items-center justify-center">
              <span className="text-white font-bold text-sm">R</span>
            </div>
            <span
              className={`font-display font-bold text-lg transition-colors ${
                scrolled ? 'text-brand-navy' : 'text-white'
              }`}
            >
              Ravello HR
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-8">
            {/* Solutions Dropdown */}
            <div
              className="relative"
              onMouseEnter={() => setSolutionsOpen(true)}
              onMouseLeave={() => setSolutionsOpen(false)}
            >
              <button
                className={`flex items-center gap-1 font-medium transition-colors ${
                  scrolled ? 'text-brand-navy' : 'text-white/90'
                } hover:text-brand-teal`}
              >
                Solutions <ChevronDown size={16} />
              </button>
              {solutionsOpen && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 p-2">
                  {solutions.map((s) => (
                    <Link
                      key={s.href}
                      href={s.href}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-brand-light group"
                    >
                      <span className={`funnel-tag text-white text-[10px] ${s.tagColor}`}>
                        {s.tag}
                      </span>
                      <span className="text-sm font-medium text-brand-navy group-hover:text-brand-teal">
                        {s.label}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Tools Dropdown */}
            <div
              className="relative"
              onMouseEnter={() => setToolsOpen(true)}
              onMouseLeave={() => setToolsOpen(false)}
            >
              <button
                className={`flex items-center gap-1 font-medium transition-colors ${
                  scrolled ? 'text-brand-navy' : 'text-white/90'
                } hover:text-brand-teal`}
              >
                Free Tools <ChevronDown size={16} />
              </button>
              {toolsOpen && (
                <div className="absolute top-full left-0 mt-2 w-60 bg-white rounded-xl shadow-xl border border-gray-100 p-2">
                  {tools.map((t) => (
                    <Link
                      key={t.href}
                      href={t.href}
                      className="block px-3 py-2.5 rounded-lg hover:bg-brand-light text-sm font-medium text-brand-navy hover:text-brand-teal"
                    >
                      {t.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Link
              href="/playbook"
              className={`font-medium transition-colors ${
                scrolled ? 'text-brand-navy' : 'text-white/90'
              } hover:text-brand-teal`}
            >
              Playbook
            </Link>
            <Link
              href="/about"
              className={`font-medium transition-colors ${
                scrolled ? 'text-brand-navy' : 'text-white/90'
              } hover:text-brand-teal`}
            >
              About
            </Link>
            <Link
              href="/book"
              className="btn-primary text-sm py-2 px-5"
            >
              Book a Free Call
            </Link>
          </div>

          {/* Mobile menu toggle */}
          <button
            className={`lg:hidden p-2 ${scrolled ? 'text-brand-navy' : 'text-white'}`}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {open && (
          <div className="lg:hidden bg-white rounded-b-xl shadow-lg border-t border-gray-100 pb-4">
            <div className="px-4 pt-4 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-slate px-3 pb-1">Solutions</p>
              {solutions.map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  className="block px-3 py-2.5 rounded-lg text-brand-navy font-medium hover:bg-brand-light"
                  onClick={() => setOpen(false)}
                >
                  {s.label}
                </Link>
              ))}
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-slate px-3 pt-2 pb-1">Free Tools</p>
              {tools.map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  className="block px-3 py-2.5 rounded-lg text-brand-navy font-medium hover:bg-brand-light"
                  onClick={() => setOpen(false)}
                >
                  {t.label}
                </Link>
              ))}
              <div className="pt-2 px-3">
                <Link href="/book" className="btn-primary w-full justify-center" onClick={() => setOpen(false)}>
                  Book a Free Call
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
