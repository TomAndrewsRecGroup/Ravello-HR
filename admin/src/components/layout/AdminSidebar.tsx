'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Building2, Briefcase,
  FolderOpen, LifeBuoy, LogOut,
  Inbox, Map, BarChart3, BookOpen, ShieldCheck, PoundSterling, Radio, UserPlus,
  X, Activity, TrendingUp, Users, FileText, CheckSquare, Rss, Gauge,
} from 'lucide-react';
import { useMobileMenu } from './MobileMenuContext';

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';

const nav = [
  { href: '/dashboard',       label: 'Dashboard',       icon: LayoutDashboard, sub: null },
  { href: '/clients',         label: 'Clients',          icon: Building2,       sub: null },
  { href: '/hiring',          label: 'Hiring',           icon: Briefcase,       sub: '/hiring/analytics' },
  { href: '/tasks',            label: 'Tasks',            icon: CheckSquare,     sub: null },
  { href: '/activity',        label: 'Activity',         icon: Rss,             sub: null },
  { href: '/engagement',      label: 'Engagement',       icon: Gauge,           sub: null },
  { href: '/revenue',         label: 'Revenue',          icon: TrendingUp,      sub: null },
  { href: '/requests',        label: 'Service Requests', icon: Inbox,           sub: null },
  { href: '/broadcast',       label: 'Broadcast',        icon: Radio,           sub: null },
  { href: '/value-reports',   label: 'Value Reports',    icon: FileText,        sub: null },
  { href: '/documents',       label: 'Documents',        icon: FolderOpen,      sub: null },
  { href: '/reports',         label: 'Reports',          icon: BarChart3,       sub: null },
  { href: '/compliance',      label: 'Compliance',       icon: ShieldCheck,     sub: null },
  { href: '/salary-benchmarks', label: 'Benchmarks',    icon: PoundSterling,   sub: null },
  { href: '/learning',        label: 'Learning',         icon: BookOpen,        sub: null },
  { href: '/clients/onboard', label: 'Onboard Client', icon: UserPlus,        sub: null },
  { href: '/support',         label: 'Support',          icon: LifeBuoy,        sub: null },
];

export default function AdminSidebar() {
  const path = usePathname();
  const { isOpen, close } = useMobileMenu();

  return (
    <>
      {/* Backdrop overlay for mobile/tablet */}
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
        {/* Logo area */}
        <div
          className="relative flex items-center gap-3 px-5 py-4"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <Link href="/dashboard" className="flex items-center">
            <Image
              src={LOGO}
              alt="The People System"
              width={160}
              height={52}
              className="h-7 w-auto object-contain"
              priority
            />
          </Link>
          <span
            className="text-[9px] font-semibold uppercase tracking-[0.08em] ml-auto px-2 py-0.5 rounded-md"
            style={{
              background: 'rgba(124,58,237,0.08)',
              color: 'var(--purple)',
            }}
          >
            Admin
          </span>
          {/* Close button — visible on mobile/tablet only */}
          <button
            onClick={close}
            className="lg:hidden ml-auto flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
            style={{ color: 'var(--ink-faint)' }}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="relative flex-1 overflow-y-auto px-3 pt-5">
          <p className="nav-section-label">Operations</p>
          <div className="space-y-0.5">
            {nav.map((item) => {
              const active = path.startsWith(item.href);
              const hasSub = item.sub && active;
              return (
                <div key={item.href}>
                  <Link href={item.href} className={`nav-link ${active ? 'active' : ''}`}>
                    <item.icon size={15} />
                    <span>{item.label}</span>
                  </Link>
                  {hasSub && (
                    <Link
                      href={item.sub!}
                      className={`nav-link pl-9 text-xs ${path === item.sub ? 'active' : ''}`}
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
        </nav>

        <div className="relative p-4" style={{ borderTop: '1px solid var(--line)' }}>
          <form action="/auth/signout" method="post">
            <button type="submit" className="nav-link w-full text-left">
              <LogOut size={14} /> <span className="text-sm">Sign out</span>
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
