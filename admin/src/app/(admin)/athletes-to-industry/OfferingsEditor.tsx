'use client';

import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import type { TrainingOffering } from './types';

interface Props {
  value: TrainingOffering[];
  onChange: (next: TrainingOffering[]) => void;
}

function tempId(): string {
  return 'new-' + Math.random().toString(36).slice(2, 10);
}

const FORMAT_HINTS = ['Course', 'Workshop', 'Webinar', 'Coaching', 'Bootcamp'];

export default function OfferingsEditor({ value, onChange }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  function addRow() {
    const next: TrainingOffering = {
      id: tempId(), title: '', description: null, location: null, format: null, url: null,
    };
    onChange([...value, next]);
    setOpenId(next.id);
  }

  function update(id: string, patch: Partial<TrainingOffering>) {
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
          No offerings yet. Add the first one below.
        </p>
      )}

      {value.map(offering => {
        const isOpen = openId === offering.id;
        return (
          <div key={offering.id} className="rounded-[10px]"
               style={{ background: 'rgba(59,111,255,0.04)', border: '1px solid rgba(59,111,255,0.18)' }}>
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : offering.id)}
                className="text-left flex-1 flex items-center gap-2"
              >
                {isOpen
                  ? <ChevronDown size={12} style={{ color: 'var(--blue)' }} />
                  : <ChevronRight size={12} style={{ color: 'var(--blue)' }} />}
                <input
                  className="input"
                  style={{ padding: '4px 8px', fontSize: 12 }}
                  placeholder="Course or workshop title"
                  value={offering.title}
                  onChange={e => update(offering.id, { title: e.target.value })}
                  onClick={e => e.stopPropagation()}
                />
              </button>
              <button
                type="button"
                onClick={() => remove(offering.id)}
                className="btn-icon btn-sm"
                style={{ color: 'var(--red)' }}
                title="Remove offering"
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
                    placeholder="What does this cover? Who is it for?"
                    value={offering.description ?? ''}
                    onChange={e => update(offering.id, { description: e.target.value || null })}
                  />
                </div>
                <div>
                  <label className="label">Format</label>
                  <input
                    className="input"
                    list={`fmt-${offering.id}`}
                    placeholder="Course, Workshop, Webinar…"
                    value={offering.format ?? ''}
                    onChange={e => update(offering.id, { format: e.target.value || null })}
                  />
                  <datalist id={`fmt-${offering.id}`}>
                    {FORMAT_HINTS.map(h => <option key={h} value={h} />)}
                  </datalist>
                </div>
                <div>
                  <label className="label">Location</label>
                  <input
                    className="input"
                    placeholder="London, Online, Hybrid"
                    value={offering.location ?? ''}
                    onChange={e => update(offering.id, { location: e.target.value || null })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Sign-up / details URL</label>
                  <input
                    className="input"
                    placeholder="https://example.com/courses/leadership"
                    value={offering.url ?? ''}
                    onChange={e => update(offering.id, { url: e.target.value || null })}
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
        <Plus size={12} /> Add offering
      </button>
    </div>
  );
}
