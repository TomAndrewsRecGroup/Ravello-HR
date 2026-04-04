'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Building2, Briefcase, Users,
  FolderOpen, LifeBuoy, LogOut,
  Inbox, BarChart3, BookOpen, ShieldCheck, PoundSterling, Radio, UserPlus,
  X, TrendingUp, FileText, CheckSquare, Rss, Gauge,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { useMobileMenu } from './MobileMenuContext';

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';

interface NavItem { href: string; label: string; icon: React.ElementType; }
interface NavGroup { label: string; items: NavItem[]; defaultOpen?: boolean; }

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Clients',
    defaultOpen: true,
    items: [
      { href: '/clients',         label: 'All Clients',    icon: Building2 },
      { href: '/clients/onboard', label: 'Onboard',        icon: UserPlus },
      { href: '/engagement',      label: 'Engagement',     icon: Gauge },
    ],
  },
  {
    label: 'Hiring',
    defaultOpen: true,
    items: [
      { href: '/hiring',          label: 'Roles',          icon: Briefcase },
      { href: '/hiring/templates', label: 'Templates',     icon: FileText },
      { href: '/salary-benchmarks', label: 'Benchmarks',  icon: PoundSterling },
    ],
  },
  {
    label: 'Operations',
    defaultOpen: true,
    items: [
      { href: '/tasks',           label: 'Tasks',          icon: CheckSquare },
      { href: '/activity',        label: 'Activity',       icon: Rss },
      { href: '/requests',        label: 'Requests',       icon: Inbox },
      { href: '/support',         label: 'Tickets',        icon: LifeBuoy },
      { href: '/broadcast',       label: 'Broadcast',      icon: Radio },
      { href: '/compliance',      label: 'Compliance',     icon: ShieldCheck },
    ],
  },
  {
    label: 'Business',
    defaultOpen: false,
    items: [
      { href: '/revenue',         label: 'Revenue',        icon: TrendingUp },
      { href: '/value-reports',   label: 'Value Reports',  icon: BarChart3 },
      { href: '/reports',         label: 'CSV Exports',    icon: FolderOpen },
      { href: '/documents',       label: 'Documents',      icon: FileText },
      { href: '/learning',        label: 'Learning',       icon: BookOpen },
    ],
  },
];

export default function AdminSidebar() {
  const path = usePathname();
  const { isOpen, close } = useMobileMenu();

  // Track which groups are expanded
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    NAV_GROUPS.forEach(g => { init[g.label] = g.defaultOpen ?? false; });
    return init;
  });

  function toggleGroup(label: string) {
    setExpanded(prev => ({ ...prev, [label]: !prev[label] }));
  }

  return (
    <>
      <div
        className={`sidebar-backdrop ${isOpen ? 'open' : ''}`}
        onClick={close}
        aria-hidden="true"
      />

      <aside
        className={`sidebar-mobile fixed top-0 left-0 h-screen flex flex-col z-40 ${isOpen ? 'open' : ''}`}
        style={{
          width: 'var(--sidebar-w)',
          background: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--sidebar-border)',
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <Link href="/dashboard" className="flex items-center">
            <Image src={LOGO} alt="The People System" width={160} height={52} className="h-7 w-auto object-contain" priority />
          </Link>
          <span className="text-[9px] font-semibold uppercase tracking-[0.08em] ml-auto px-2 py-0.5 rounded-md" style={{ background: 'rgba(124,58,237,0.08)', color: 'var(--purple)' }}>
            Admin
          </span>
          <button onClick={close} className="lg:hidden ml-auto flex items-center justify-center w-7 h-7 rounded-md" style={{ color: 'var(--ink-faint)' }} aria-label="Close menu">
            <X size={16} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pt-3 pb-2">
          {/* Dashboard — always top-level */}
          <Link
            href="/dashboard"
            className={`nav-link mb-1 ${path === '/dashboard' ? 'active' : ''}`}
          >
            <LayoutDashboard size={15} />
            <span>Dashboard</span>
          </Link>

          {/* Grouped navigation */}
          {NAV_GROUPS.map(group => {
            const isExpanded = expanded[group.label];
            const hasActive = group.items.some(item => path.startsWith(item.href));

            return (
              <div key={group.label} className="mt-1">
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center justify-between px-3 py-1.5 rounded-md transition-colors hover:bg-[var(--surface-alt)]"
                >
                  <span
                    className="text-[10px] font-semibold uppercase tracking-[0.06em]"
                    style={{ color: hasActive ? 'var(--purple)' : 'var(--ink-faint)' }}
                  >
                    {group.label}
                  </span>
                  {isExpanded
                    ? <ChevronDown size={12} style={{ color: 'var(--ink-faint)' }} />
                    : <ChevronRight size={12} style={{ color: 'var(--ink-faint)' }} />}
                </button>

                {isExpanded && (
                  <div className="mt-0.5 space-y-0.5">
                    {group.items.map(item => {
                      const active = path === item.href || (path.startsWith(item.href) && item.href !== '/clients');
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`nav-link ${active ? 'active' : ''}`}
                        >
                          <item.icon size={14} />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="p-3" style={{ borderTop: '1px solid var(--line)' }}>
          <form action="/auth/signout" method="post">
            <button type="submit" className="nav-link w-full text-left">
              <LogOut size={14} /> <span>Sign out</span>
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
