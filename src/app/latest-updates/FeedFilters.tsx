'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

export interface FilterOption { value: string; label: string; count?: number }

interface Props {
  categories: FilterOption[];
  sources: FilterOption[];
  activeCategory: string | null;
  activeSource: string | null;
  activeQuery: string;
}

export default function FeedFilters({
  categories, sources, activeCategory, activeSource, activeQuery,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(activeQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQuery(activeQuery); }, [activeQuery]);

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    params.delete('page');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function onSearchChange(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setParam('q', v.trim() || null);
    }, 350);
  }

  function clearAll() {
    router.push(pathname, { scroll: false });
  }

  const hasAny = activeCategory || activeSource || activeQuery;

  return (
    <div className="space-y-5">

      {/* Category pills */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <FilterPill
            label="All"
            active={!activeCategory}
            onClick={() => setParam('category', null)}
          />
          {categories.map(c => (
            <FilterPill
              key={c.value}
              label={c.label}
              count={c.count}
              active={activeCategory === c.value}
              onClick={() => setParam('category', activeCategory === c.value ? null : c.value)}
            />
          ))}
        </div>
      )}

      {/* Search + source */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--ink-faint)' }}
          />
          <input
            type="search"
            placeholder="Search updates by title or description"
            value={query}
            onChange={e => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-[14px] text-sm"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--brand-line, var(--line, rgba(10,15,30,0.08)))',
              color: 'var(--ink)',
            }}
          />
        </div>

        {sources.length > 0 && (
          <select
            value={activeSource ?? ''}
            onChange={e => setParam('source', e.target.value || null)}
            className="py-2.5 px-3.5 rounded-[14px] text-sm sm:min-w-[220px]"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--brand-line, var(--line, rgba(10,15,30,0.08)))',
              color: 'var(--ink)',
            }}
          >
            <option value="">All sources</option>
            {sources.map(s => (
              <option key={s.value} value={s.value}>
                {s.label}{s.count != null ? ` (${s.count})` : ''}
              </option>
            ))}
          </select>
        )}

        {hasAny && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg hover:bg-[rgba(124,58,237,0.06)]"
            style={{ color: 'var(--brand-purple, #7C3AED)' }}
          >
            <X size={13} /> Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

function FilterPill({
  label, count, active, onClick,
}: {
  label: string; count?: number; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-xs font-semibold px-3.5 py-1.5 rounded-full transition-all"
      style={{
        background: active ? 'var(--brand-purple, #7C3AED)' : 'var(--surface)',
        color: active ? '#fff' : 'var(--ink-soft)',
        border: `1px solid ${active ? 'var(--brand-purple, #7C3AED)' : 'var(--brand-line, var(--line, rgba(10,15,30,0.08)))'}`,
      }}
    >
      {label}
      {count != null && (
        <span className="ml-1.5 opacity-70 font-normal">{count}</span>
      )}
    </button>
  );
}
