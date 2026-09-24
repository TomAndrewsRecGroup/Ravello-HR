'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, LogOut } from 'lucide-react';
import { BRAND_LOGO, BRAND_NAME } from '@/lib/brand';
import type { HsMyCompany } from '@/lib/hs/types';

interface Props {
  companies:    HsMyCompany[];
  isStaff:      boolean;
  providerName: string | null;
  userEmail:    string;
  children:     React.ReactNode;
}

// The H&S workspace frame: a top bar with the client switcher, and no
// staff sidebar. Deliberately small so it works on a phone on site.
export default function HsShell({ companies, isStaff, providerName, userEmail, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const current = /^\/hs\/c\/([0-9a-f-]{36})/.exec(pathname)?.[1] ?? '';

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header
        className="sticky top-0 z-20 flex flex-wrap items-center gap-3 px-4 md:px-6"
        style={{ minHeight: 'var(--topbar-h)', background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}
      >
        <Link href="/hs" className="flex items-center gap-2 py-2">
          <Image src={BRAND_LOGO} alt={BRAND_NAME} width={140} height={30} className="h-7 w-auto" unoptimized />
          <span className="text-xs font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--ink-soft)' }}>Health &amp; Safety</span>
        </Link>

        {companies.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">Client</span>
            <select
              className="input"
              style={{ minWidth: 200 }}
              value={current}
              onChange={e => router.push(e.target.value ? `/hs/c/${e.target.value}` : '/hs')}
            >
              <option value="">All my clients</option>
              {companies.map(c => <option key={c.company_id} value={c.company_id}>{c.name}</option>)}
            </select>
          </label>
        )}

        <div className="ml-auto flex items-center gap-3 text-sm" style={{ color: 'var(--ink-soft)' }}>
          {isStaff
            ? <Link href="/dashboard" className="btn-ghost btn-sm"><ArrowLeft size={14} /> Admin</Link>
            : providerName && <span className="hidden sm:inline">{providerName}</span>}
          <span className="hidden md:inline" style={{ color: 'var(--ink-faint)' }}>{userEmail}</span>
          <form action="/auth/signout" method="post">
            <button className="btn-ghost btn-sm" aria-label="Sign out"><LogOut size={14} /> <span className="hidden sm:inline">Sign out</span></button>
          </form>
        </div>
      </header>
      <main className="max-w-6xl mx-auto p-4 md:p-6">{children}</main>
    </div>
  );
}
