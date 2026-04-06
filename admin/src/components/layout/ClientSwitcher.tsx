'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Building2, ChevronDown, X, Search } from 'lucide-react';

interface Company {
  id: string;
  name: string;
}

interface ClientSwitcherContextValue {
  selectedClientId: string | null;
  selectedClientName: string | null;
  setClient: (id: string | null) => void;
  companies: Company[];
}

const ClientSwitcherContext = createContext<ClientSwitcherContextValue>({
  selectedClientId: null,
  selectedClientName: null,
  setClient: () => {},
  companies: [],
});

export function useClientSwitcher() {
  return useContext(ClientSwitcherContext);
}

export function ClientSwitcherProvider({ children }: { children: React.ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.from('companies').select('id, name').eq('active', true).order('name').then(({ data }) => {
      if (data) setCompanies(data);
    });
  }, []);

  const selectedClientName = selectedClientId
    ? companies.find(c => c.id === selectedClientId)?.name ?? null
    : null;

  const setClient = useCallback((id: string | null) => {
    setSelectedClientId(id);
  }, []);

  return (
    <ClientSwitcherContext.Provider value={{ selectedClientId, selectedClientName, setClient, companies }}>
      {children}
    </ClientSwitcherContext.Provider>
  );
}

/* ─── Dropdown Component for Topbar ───────────────── */
export function ClientSwitcherDropdown() {
  const { selectedClientId, selectedClientName, setClient, companies } = useClientSwitcher();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = search
    ? companies.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : companies;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        style={{
          background: selectedClientId ? 'rgba(124,58,237,0.06)' : 'var(--surface-alt)',
          color: selectedClientId ? 'var(--purple)' : 'var(--ink-soft)',
          border: `1px solid ${selectedClientId ? 'rgba(124,58,237,0.20)' : 'var(--line)'}`,
        }}
      >
        <Building2 size={12} />
        <span className="max-w-[140px] truncate">
          {selectedClientName ?? 'All Clients'}
        </span>
        <ChevronDown size={11} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-[calc(100%+4px)] w-full sm:w-[240px] rounded-xl shadow-xl z-50 overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)', animation: 'slideDown 0.12s ease' }}
          >
            {/* Search */}
            <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--line)' }}>
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
                <input
                  className="w-full text-xs py-1.5 pl-7 pr-2 rounded-md outline-none"
                  style={{ background: 'var(--surface-soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}
                  placeholder="Search clients..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            {/* All clients option */}
            <button
              onClick={() => { setClient(null); setOpen(false); setSearch(''); }}
              className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-[var(--surface-soft)] transition-colors flex items-center gap-2"
              style={{
                color: !selectedClientId ? 'var(--purple)' : 'var(--ink-soft)',
                background: !selectedClientId ? 'rgba(124,58,237,0.04)' : undefined,
                borderBottom: '1px solid var(--line)',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: !selectedClientId ? 'var(--purple)' : 'transparent' }} />
              All Clients
            </button>

            {/* Client list */}
            <div className="max-h-[240px] overflow-y-auto">
              {filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setClient(c.id); setOpen(false); setSearch(''); }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--surface-soft)] transition-colors flex items-center gap-2"
                  style={{
                    color: selectedClientId === c.id ? 'var(--purple)' : 'var(--ink)',
                    background: selectedClientId === c.id ? 'rgba(124,58,237,0.04)' : undefined,
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: selectedClientId === c.id ? 'var(--purple)' : 'transparent' }} />
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-xs text-center py-4" style={{ color: 'var(--ink-faint)' }}>No clients found</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
