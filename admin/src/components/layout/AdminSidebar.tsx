'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Building2, Briefcase,
  FolderOpen, LifeBuoy, LogOut,
  Inbox, Map, BarChart3, BookOpen, ShieldCheck, PoundSterling, Radio, Key,
} from 'lucide-react';

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';

const nav = [
  { href: '/dashboard',       label: 'Dashboard',       icon: LayoutDashboard, sub: null },
  { href: '/clients',         label: 'Clients',          icon: Building2,       sub: null },
  { href: '/hiring',          label: 'Hiring',           icon: Briefcase,       sub: '/hiring/analytics' },
  { href: '/requests',        label: 'Service Requests', icon: Inbox,           sub: null },
  { href: '/broadcast',       label: 'Broadcast',        icon: Radio,           sub: null },
  { href: '/roadmap',         label: 'Roadmap',          icon: Map,             sub: null },
  { href: '/documents',       label: 'Documents',        icon: FolderOpen,      sub: null },
  { href: '/reports',         label: 'Reports',          icon: BarChart3,       sub: null },
  { href: '/compliance',      label: 'Compliance',       icon: ShieldCheck,     sub: null },
  { href: '/salary-benchmarks', label: 'Benchmarks',    icon: PoundSterling,   sub: null },
  { href: '/learning',        label: 'Learning',         icon: BookOpen,        sub: null },
  { href: '/partners',        label: 'Partners',         icon: Key,             sub: null },
  { href: '/support',         label: 'Support',          icon: LifeBuoy,        sub: null },
];

export default function AdminSidebar() {
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

      {/* Logo area — more breathing room */}
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
          Admin
        </span>
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

      <div className="relative p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <form action="/auth/signout" method="post">
          <button type="submit" className="nav-link w-full text-left">
            <LogOut size={14} /> <span className="text-sm">Sign out</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
