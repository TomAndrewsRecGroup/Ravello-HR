'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Building2, Users, Briefcase,
  FolderOpen, LifeBuoy, ToggleLeft, LogOut, ChevronRight,
} from 'lucide-react';

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/d853d50b-40d4-47f4-ac80-7058a2387dac.png';

const nav = [
  { href: '/dashboard',     label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/clients',       label: 'Clients',         icon: Building2 },
  { href: '/users',         label: 'Users',           icon: Users },
  { href: '/hiring',        label: 'Hiring',          icon: Briefcase },
  { href: '/documents',     label: 'Documents',       icon: FolderOpen },
  { href: '/support',       label: 'Support',         icon: LifeBuoy },
  { href: '/feature-flags', label: 'Feature Flags',   icon: ToggleLeft },
];

export default function AdminSidebar() {
  const path = usePathname();
  return (
    <aside
      className="fixed top-0 left-0 h-screen flex flex-col z-40"
      style={{ width: 'var(--sidebar-w)', background: 'var(--navy)', borderRight: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center gap-2 px-5 h-[var(--topbar-h)]" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Link href="/dashboard">
          <Image src={LOGO} alt="Ravello" width={110} height={36} className="h-8 w-auto object-contain brightness-110" priority />
        </Link>
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] ml-auto px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.25)', color: '#FCA5A5' }}>
          Admin
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pt-4">
        <p className="nav-section-label">Operations</p>
        <div className="space-y-0.5">
          {nav.map((item) => {
            const active = path.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={`nav-link ${active ? 'active' : ''}`}>
                <item.icon size={15} />
                <span>{item.label}</span>
                {active && <ChevronRight size={12} className="ml-auto" style={{ color: 'rgba(255,255,255,0.3)' }} />}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <form action="/auth/signout" method="post">
          <button type="submit" className="nav-link w-full text-left">
            <LogOut size={14} /> <span className="text-sm">Sign out</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
