'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Briefcase, FolderOpen, BarChart3,
  LifeBuoy, LogOut, Settings, Bell, Map, ShieldCheck, TrendingUp,
  BookOpen, Users, PoundSterling, Lock, Gauge, Target, KeyRound,
} from 'lucide-react';

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';

/* Map nav href → counts key */
const COUNT_KEY: Record<string, string> = {
  '/actions':    'actions',
  '/support':    'tickets',
  '/hiring':     'candidates',
  '/compliance': 'compliance',
  '/protect':    'emp_docs_expired',
};

const nav = [
  { href: '/dashboard',    label: 'Dashboard',   icon: LayoutDashboard, flag: null },
  { href: '/hiring',       label: 'Hiring',       icon: Briefcase,       flag: 'hiring', sub: '/hiring/analytics' },
  { href: '/friction-lens', label: 'Friction Lens', icon: Gauge,          flag: 'friction_lens' },
  { href: '/bd',           label: 'BD Leads',     icon: Target,          flag: null },
  { href: '/lead',         label: 'LEAD',         icon: BookOpen,        flag: 'lead' },
  { href: '/protect',      label: 'PROTECT',      icon: Users,           flag: 'protect' },
  { href: '/documents',    label: 'Documents',    icon: FolderOpen,      flag: 'documents' },
  { href: '/actions',      label: 'Actions',      icon: Bell,            flag: null },
  { href: '/roadmap',      label: 'Roadmap',      icon: Map,             flag: null },
  { href: '/compliance',   label: 'Compliance',   icon: ShieldCheck,     flag: 'compliance' },
  { href: '/metrics',      label: 'Metrics',      icon: TrendingUp,      flag: 'metrics' },
  { href: '/benchmarks',   label: 'Benchmarks',   icon: PoundSterling,   flag: 'benchmarks' },
  { href: '/reports',      label: 'Reports',      icon: BarChart3,       flag: 'reports' },
  { href: '/learning',     label: 'Learning',     icon: BookOpen,        flag: 'learning' },
  { href: '/support',      label: 'Support',      icon: LifeBuoy,        flag: 'support' },
];

interface Props {
  flags?:  Record<string, boolean>;
  counts?: Record<string, number>;
}

export default function Sidebar({ flags = {}, counts = {} }: Props) {
  const path = usePathname();

  return (
    <aside
      className="fixed top-0 left-0 h-screen flex flex-col z-40"
      style={{
        width: 'var(--sidebar-w)',
        background: 'var(--navy)',
        borderRight: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Subtle gradient wash at top */}
      <div
        className="absolute top-0 left-0 right-0 h-40 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(124,58,237,0.06) 0%, transparent 100%)',
        }}
      />

      {/* Logo */}
      <div
        className="relative flex items-center gap-3 px-5 py-5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <Link href="/dashboard" className="flex items-center">
          <Image
            src={LOGO}
            alt="The People System"
            width={160}
            height={52}
            className="h-9 w-auto object-contain"
            style={{ filter: 'brightness(0) invert(1)' }}
            priority
          />
        </Link>
        <span
          className="text-[9px] font-bold uppercase tracking-[0.16em] ml-auto px-2 py-0.5 rounded-[6px]"
          style={{
            background: 'rgba(124,58,237,0.20)',
            color: 'rgba(166,125,255,0.85)',
          }}
        >
          Portal
        </span>
      </div>

      {/* Nav */}
      <nav className="relative flex-1 overflow-y-auto px-3 pt-5">
        <p className="nav-section-label">Workspace</p>
        <div className="space-y-0.5">
          {nav.map((item) => {
            const disabled  = item.flag !== null && flags[item.flag] === false;
            const active    = !disabled && path.startsWith(item.href);
            const countKey  = COUNT_KEY[item.href];
            const count     = countKey ? (counts[countKey] ?? 0) : 0;
            const hasSub    = (item as any).sub && active;

            if (disabled) {
              return (
                <div
                  key={item.href}
                  className="nav-link cursor-not-allowed select-none"
                  style={{ opacity: 0.25 }}
                  title="This module is not enabled for your account"
                >
                  <item.icon size={15} />
                  <span>{item.label}</span>
                  <Lock size={11} className="ml-auto" style={{ color: 'rgba(255,255,255,0.30)' }} />
                </div>
              );
            }

            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  className={`nav-link ${active ? 'active' : ''}`}
                >
                  <item.icon size={15} />
                  <span>{item.label}</span>
                  {count > 0 && (
                    <span
                      className="ml-auto w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        background: item.href === '/actions' || item.href === '/compliance'
                          ? 'var(--gradient)'
                          : 'rgba(245,158,11,0.85)',
                      }}
                      title={`${count} pending`}
                    />
                  )}
                </Link>
                {hasSub && (
                  <Link
                    href={(item as any).sub}
                    className={`nav-link pl-9 text-xs ${path === (item as any).sub ? 'active' : ''}`}
                    style={{ opacity: 0.8 }}
                  >
                    <BarChart3 size={13} />
                    <span>Analytics</span>
                  </Link>
                )}
              </div>
            );
          })}
        </div>

        <p className="nav-section-label">Account</p>
        <div className="space-y-0.5">
          <Link href="/settings" className={`nav-link ${path === '/settings' ? 'active' : ''}`}>
            <Settings size={15} />
            <span>Settings</span>
          </Link>
          <Link href="/partners" className={`nav-link ${path === '/partners' ? 'active' : ''}`}>
            <KeyRound size={15} />
            <span>Partners</span>
          </Link>
        </div>
      </nav>

      {/* Footer */}
      <div
        className="relative p-4"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        <form action="/auth/signout" method="post">
          <button type="submit" className="nav-link w-full text-left">
            <LogOut size={14} />
            <span className="text-sm">Sign out</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
