'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  Search, X, Building2, Briefcase, Users, LifeBuoy,
  FileText, ShieldCheck, Loader2, UserRound, Trophy, MapPin, Network,
  CheckSquare, AlertTriangle, ClipboardCheck, Wrench,
} from 'lucide-react';

interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  organisation:    { icon: Building2,   color: 'var(--purple)', label: 'Organisation' },
  person:          { icon: UserRound,   color: 'var(--teal)',   label: 'Person' },
  employee:        { icon: UserRound,   color: 'var(--teal)',   label: 'Employee' },
  candidate:       { icon: Users,       color: 'var(--teal)',   label: 'Candidate' },
  athlete:         { icon: Trophy,      color: 'var(--gold)',   label: 'Athlete' },
  role:            { icon: Briefcase,   color: 'var(--blue)',   label: 'Role' },
  site:            { icon: MapPin,      color: 'var(--blue)',   label: 'Site' },
  department:      { icon: Network,     color: 'var(--blue)',   label: 'Department' },
  document:        { icon: FileText,    color: 'var(--purple)', label: 'Document' },
  hs_document:     { icon: FileText,    color: 'var(--purple)', label: 'H&S document' },
  action:          { icon: CheckSquare, color: 'var(--gold)',   label: 'Action' },
  incident:        { icon: AlertTriangle, color: 'var(--red)',  label: 'Incident' },
  audit:           { icon: ClipboardCheck, color: 'var(--teal)', label: 'Audit' },
  equipment:       { icon: Wrench,      color: 'var(--ink-soft)', label: 'Equipment' },
  service_request: { icon: LifeBuoy,    color: 'var(--gold)',   label: 'Request' },
  compliance:      { icon: ShieldCheck, color: 'var(--red)',    label: 'Compliance' },
};

// Where each kind of record lives in the admin app. Anything without a
// page of its own opens its organisation.
export function hrefFor(type: string, id: string, org: string | null): string {
  switch (type) {
    case 'organisation':    return `/clients/${id}`;
    case 'role':            return `/hiring/${id}`;
    case 'candidate':       return '/candidates';
    case 'athlete':         return '/athletes-to-industry';
    case 'document':        return '/documents';
    case 'service_request': return '/requests';
    case 'site':            return org ? `/health-safety/${org}` : '/health-safety';
    case 'hs_document':     return org ? `/health-safety/${org}/documents` : '/health-safety';
    case 'incident':        return org ? `/health-safety/${org}/incidents` : '/health-safety';
    case 'audit':           return org ? `/health-safety/${org}/audits/${id}` : '/health-safety';
    case 'equipment':       return org ? `/health-safety/${org}/equipment` : '/health-safety';
    default:                return org ? `/clients/${org}` : '/clients';
  }
}

export default function GlobalSearch() {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keyboard shortcut: Cmd/Ctrl+K
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    const pattern = `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`;

    // search_records() is SECURITY INVOKER: it runs under this user's own
    // RLS, so it returns only rows they could already read table by
    // table (migration 119). Compliance items are not in it yet.
    const [recRes, compRes] = await Promise.all([
      supabase.rpc('search_records', { p_query: q, p_limit: 40 }),
      supabase.from('compliance_items').select('id, title, company_id').ilike('title', pattern).limit(5),
    ]);
    if (recRes.error) console.error('[search] search_records failed:', recRes.error.message);

    const all: SearchResult[] = [
      ...((recRes.data ?? []) as Array<{ entity_type: string; entity_id: string; organisation_id: string | null; title: string; subtitle: string | null }>)
        .map(r => ({
          type: r.entity_type, id: r.entity_id, title: r.title,
          subtitle: r.subtitle ?? TYPE_CONFIG[r.entity_type]?.label ?? '',
          href: hrefFor(r.entity_type, r.entity_id, r.organisation_id),
        })),
      ...(compRes.data ?? []).map((c: any) => ({
        type: 'compliance', id: c.id, title: c.title,
        subtitle: 'Compliance', href: '/compliance',
      })),
    ];

    setResults(all);
    setSelectedIdx(0);
    setLoading(false);
  }, [supabase]);

  function handleInput(val: string) {
    setQuery(val);
    clearTimeout(debounceRef.current);
    if (val.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(() => search(val), 400);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      setOpen(false);
      router.push(results[selectedIdx].href);
    }
  }

  function navigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-icon" title="Search (⌘K)" aria-label="Search">
        <Search size={15} />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden" style={{ animation: 'fadeUp 0.15s ease' }}>
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
          <Search size={16} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 text-sm outline-none bg-transparent"
            style={{ color: 'var(--ink)' }}
            placeholder="Search clients, roles, candidates, tickets..."
            value={query}
            onChange={e => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {loading && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--purple)' }} />}
          <kbd className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-soft)', color: 'var(--ink-faint)', border: '1px solid var(--line)' }}>ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {query.length > 0 && results.length === 0 && !loading && (
            <p className="text-sm text-center py-8" style={{ color: 'var(--ink-faint)' }}>No results for "{query}"</p>
          )}
          {results.map((r, i) => {
            const tc = TYPE_CONFIG[r.type] ?? TYPE_CONFIG.organisation;
            const Icon = tc.icon;
            return (
              <div
                key={`${r.type}-${r.id}`}
                className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors"
                style={{ background: i === selectedIdx ? 'var(--surface-soft)' : 'transparent' }}
                onClick={() => navigate(r.href)}
                onMouseEnter={() => setSelectedIdx(i)}
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${tc.color}12`, color: tc.color }}>
                  <Icon size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{r.title}</p>
                  <p className="text-[10px] truncate" style={{ color: 'var(--ink-faint)' }}>{r.subtitle}</p>
                </div>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: `${tc.color}10`, color: tc.color }}>
                  {tc.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Quick actions: shown when no query */}
        {query.length === 0 && (
          <div>
            <div className="px-4 pt-3 pb-1">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>Quick Actions</p>
            </div>
            {[
              { label: 'Onboard new client',   href: '/clients/onboard', icon: Building2,   color: 'var(--purple)' },
              { label: 'Create new role',       href: '/hiring/new',     icon: Briefcase,   color: 'var(--blue)' },
              { label: 'Create task',           href: '/tasks',          icon: ShieldCheck, color: 'var(--teal)' },
              { label: 'View activity feed',    href: '/activity',       icon: Users,       color: 'var(--amber)' },
              { label: 'Generate value report', href: '/value-reports',  icon: FileText,    color: '#EA3DC4' },
              { label: 'View engagement',       href: '/engagement',     icon: LifeBuoy,    color: 'var(--danger)' },
            ].map((action, i) => (
              <div
                key={action.href}
                className="flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors hover:bg-[var(--surface-soft)]"
                onClick={() => { setOpen(false); router.push(action.href); }}
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${action.color}12`, color: action.color }}>
                  <action.icon size={13} />
                </div>
                <p className="text-sm" style={{ color: 'var(--ink)' }}>{action.label}</p>
                <span className="text-[10px] ml-auto" style={{ color: 'var(--ink-faint)' }}>→</span>
              </div>
            ))}
            <div className="px-4 py-2" style={{ borderTop: '1px solid var(--line)' }}>
              <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                Type to search across clients, roles, candidates, tickets, documents and compliance
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
