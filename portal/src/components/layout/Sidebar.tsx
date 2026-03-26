'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Briefcase, FolderOpen, BarChart3,
  LifeBuoy, LogOut, Settings, ChevronRight, Bell, Map, ShieldCheck, TrendingUp,
  BookOpen, Users,
} from 'lucide-react';

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/d853d50b-40d4-47f4-ac80-7058a2387dac.png';

/* Map nav href → counts key */
const COUNT_KEY: Record<string, string> = {
  '/actions':    'actions',
  '/support':    'tickets',
  '/hiring':     'candidates',
  '/compliance': 'compliance',
  '/protect':    'emp_docs_expired',
};

const nav = [
  { href: '/dashboard',  label: 'Dashboard',   icon: LayoutDashboard, flag: null },
  { href: '/hiring',     label: 'Hiring',       icon: Briefcase,       flag: 'hiring', sub: '/hiring/analytics' },
  { href: '/lead',       label: 'LEAD',         icon: BookOpen,        flag: 'lead' },
  { href: '/protect',    label: 'PROTECT',      icon: Users,           flag: 'protect' },
  { href: '/documents',  label: 'Documents',    icon: FolderOpen,      flag: 'documents' },
  { href: '/actions',    label: 'Actions',      icon: Bell,            flag: null },
  { href: '/roadmap',    label: 'Roadmap',      icon: Map,             flag: null },
  { href: '/compliance', label: 'Compliance',   icon: ShieldCheck,     flag: 'compliance' },
  { href: '/metrics',    label: 'Metrics',      icon: TrendingUp,      flag: 'metrics' },
  { href: '/reports',    label: 'Reports',      icon: BarChart3,       flag: 'reports' },
  { href: '/learning',   label: 'Learning',     icon: BookOpen,        flag: 'learning' },
  { href: '/support',    label: 'Support',      icon: LifeBuoy,        flag: 'support' },
];

interface Props {
  flags?:  Record<string, boolean>;
  counts?: Record<string, number>;
}

export default function Sidebar({ flags = {}, counts = {} }: Props) {
  const path = usePathname();
  const visibleNav = nav.filter(item => item.flag === null || flags[item.flag] !== false);

  return (
    <aside
      className="fixed top-0 left-0 h-screen flex flex-col z-40"
      style={{
        width: 'var(--sidebar-w)',
        background: 'var(--navy)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2 px-5 h-[var(--topbar-h)]"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <Link href="/dashboard">
          <Image
            src={LOGO}
            alt="The People Office"
            width={110}
            height={36}
            className="h-8 w-auto object-contain brightness-110"
            priority
          />
        </Link>
        <span
          className="text-[9px] font-bold uppercase tracking-[0.15em] ml-auto px-1.5 py-0.5 rounded"
          style={{ background: 'rgba(143,114,246,0.25)', color: 'rgba(147,184,255,0.9)' }}
        >
          Portal
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 pt-4">
        <p className="nav-section-label">Workspace</p>
        <div className="space-y-0.5">
          {visibleNav.map((item) => {
            const active    = path.startsWith(item.href);
            const countKey  = COUNT_KEY[item.href];
            const count     = countKey ? (counts[countKey] ?? 0) : 0;
            const hasSub    = (item as any).sub && active;

            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  className={`nav-link ${active ? 'active' : ''}`}
                >
                  <item.icon size={16} />
                  <span>{item.label}</span>
                  {count > 0 && (
                    <span
                      className="ml-auto text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1"
                      style={{
                        background: item.href === '/actions' || item.href === '/compliance'
                          ? 'rgba(239,68,68,0.85)'
                          : 'rgba(245,158,11,0.85)',
                        color: '#fff',
                      }}
                    >
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                  {active && count === 0 && (
                    <ChevronRight
                      size={12}
                      className="ml-auto"
                      style={{ color: 'rgba(255,255,255,0.35)' }}
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
            <Settings size={16} />
            <span>Settings</span>
          </Link>
        </div>
      </nav>

      {/* Footer */}
      <div
        className="p-4"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="nav-link w-full text-left"
          >
            <LogOut size={15} />
            <span className="text-sm">Sign out</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
