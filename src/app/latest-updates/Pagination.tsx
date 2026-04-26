'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page: number;
  totalPages: number;
}

export default function Pagination({ page, totalPages }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  function href(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) params.delete('page'); else params.set('page', String(p));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const pages = buildPageList(page, totalPages);

  return (
    <nav
      className="flex items-center justify-center gap-1.5 mt-12"
      aria-label="Pagination"
    >
      <PageLink
        href={href(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft size={15} />
      </PageLink>

      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className="px-2 text-sm" style={{ color: 'var(--ink-faint)' }}>
            …
          </span>
        ) : (
          <PageLink key={p} href={href(p)} active={p === page}>
            {p}
          </PageLink>
        )
      )}

      <PageLink
        href={href(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        <ChevronRight size={15} />
      </PageLink>
    </nav>
  );
}

function buildPageList(page: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: Array<number | '…'> = [1];
  if (page > 3) out.push('…');
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  for (let p = start; p <= end; p++) out.push(p);
  if (page < total - 2) out.push('…');
  out.push(total);
  return out;
}

function PageLink({
  href, children, active, disabled, ...rest
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  const className =
    'min-w-[36px] h-9 px-3 text-xs font-semibold rounded-[10px] flex items-center justify-center transition-colors';
  const style: React.CSSProperties = active
    ? { background: 'var(--brand-purple, #7C3AED)', color: '#fff', border: '1px solid var(--brand-purple, #7C3AED)' }
    : {
        background: 'var(--surface)',
        color: 'var(--ink)',
        border: '1px solid var(--brand-line, var(--line, rgba(10,15,30,0.08)))',
        opacity: disabled ? 0.4 : 1,
      };
  if (disabled) {
    return (
      <span
        className={className}
        style={{ ...style, cursor: 'not-allowed' }}
        aria-disabled="true"
        {...rest}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={`${className} hover:-translate-y-px`}
      style={style}
      scroll={true}
      {...rest}
    >
      {children}
    </Link>
  );
}
