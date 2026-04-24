'use client';

import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import type { RoleOpportunity } from './types';

interface Props {
  value: RoleOpportunity[];
  onChange: (next: RoleOpportunity[]) => void;
}

// New rows use a temporary client ID; the server replaces it on POST
// for items without a uuid-shaped id.
function tempId(): string {
  return 'new-' + Math.random().toString(36).slice(2, 10);
}

export default function RoleOpportunitiesEditor({ value, onChange }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  function addRow() {
    const next: RoleOpportunity = { id: tempId(), title: '', description: null, location: null, url: null };
    onChange([...value, next]);
    setOpenId(next.id);
  }

  function update(id: string, patch: Partial<RoleOpportunity>) {
    onChange(value.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  function remove(id: string) {
    onChange(value.filter(r => r.id !== id));
    if (openId === id) setOpenId(null);
  }

  return (
    <div className="space-y-2">
      {value.length === 0 && (
        <p className="text-xs italic" style={{ color: 'var(--ink-faint)' }}>
          No roles yet. Add the first one below.
        </p>
      )}

      {value.map(role => {
        const isOpen = openId === role.id;
        return (
          <div key={role.id} className="rounded-[10px]" style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)' }}>
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : role.id)}
                className="text-left flex-1 flex items-center gap-2"
              >
                {isOpen
                  ? <ChevronDown size={12} style={{ color: 'var(--ink-faint)' }} />
                  : <ChevronRight size={12} style={{ color: 'var(--ink-faint)' }} />}
                <input
                  className="input"
                  style={{ padding: '4px 8px', fontSize: 12 }}
                  placeholder="Role title"
                  value={role.title}
                  onChange={e => update(role.id, { title: e.target.value })}
                  onClick={e => e.stopPropagation()}
                />
              </button>
              <button
                type="button"
                onClick={() => remove(role.id)}
                className="btn-icon btn-sm"
                style={{ color: 'var(--red)' }}
                title="Remove role"
              >
                <Trash2 size={12} />
              </button>
            </div>
            {isOpen && (
              <div className="px-3 pb-3 grid sm:grid-cols-2 gap-2">
                <div className="sm:col-span-2">
                  <label className="label">Description</label>
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="What's the role about?"
                    value={role.description ?? ''}
                    onChange={e => update(role.id, { description: e.target.value || null })}
                  />
                </div>
                <div>
                  <label className="label">Location</label>
                  <input
                    className="input"
                    placeholder="London, Manchester, Remote"
                    value={role.location ?? ''}
                    onChange={e => update(role.id, { location: e.target.value || null })}
                  />
                </div>
                <div>
                  <label className="label">Apply / details URL</label>
                  <input
                    className="input"
                    placeholder="https://example.com/jobs/123"
                    value={role.url ?? ''}
                    onChange={e => update(role.id, { url: e.target.value || null })}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={addRow}
        className="btn-secondary btn-sm flex items-center gap-1.5"
      >
        <Plus size={12} /> Add role
      </button>
    </div>
  );
}
