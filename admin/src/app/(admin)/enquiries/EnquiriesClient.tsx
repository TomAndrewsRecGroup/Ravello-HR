'use client';
import { useMemo, useState } from 'react';
import { Mail, Phone, Building2, Search, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export interface Enquiry {
  id:           string;
  full_name:    string;
  email:        string;
  phone:        string | null;
  company_name: string | null;
  source:       string;
  result:       Record<string, unknown> | null;
  status:       'new' | 'contacted' | 'booked' | 'closed';
  notes:        string | null;
  created_at:   string;
}

const SOURCE_LABEL: Record<string, string> = {
  hiring_score:       'Smart Hiring Score',
  hr_risk:            'HR Risk Score',
  policy_healthcheck: 'Policy Healthcheck',
  due_diligence:      'DD Checklist',
  contact:            'Contact',
};

const STATUS_TONE: Record<Enquiry['status'], { bg: string; fg: string }> = {
  new:       { bg: 'rgba(124,58,237,0.12)', fg: 'var(--purple)'    },
  contacted: { bg: 'rgba(59,111,255,0.12)', fg: 'var(--blue)'      },
  booked:    { bg: 'rgba(20,184,166,0.12)', fg: 'var(--teal)'      },
  closed:    { bg: 'var(--surface-alt)',     fg: 'var(--ink-faint)' },
};

export default function EnquiriesClient({ initial }: { initial: Enquiry[] }) {
  const supabase = createClient();
  const [rows,   setRows]   = useState<Enquiry[]>(initial);
  const [q,      setQ]      = useState('');
  const [source, setSource] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [sel,    setSel]    = useState<Enquiry | null>(null);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (source !== 'all' && r.source !== source) return false;
      if (status !== 'all' && r.status !== status) return false;
      if (q) {
        const s = q.toLowerCase();
        const blob = `${r.full_name} ${r.email} ${r.phone ?? ''} ${r.company_name ?? ''}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      return true;
    });
  }, [rows, q, source, status]);

  async function update(id: string, patch: Partial<Enquiry>) {
    const { data } = await supabase.from('enquiries').update(patch).eq('id', id).select().single();
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...(data as Enquiry) } : r)));
    if (sel?.id === id) setSel((s) => (s ? { ...s, ...(data as Enquiry) } : s));
  }

  return (
    <div className="grid lg:grid-cols-[1fr_420px] gap-6">
      <div>
        <div className="card p-4 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
              <input
                type="search"
                placeholder="Search name, email, phone, company"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="input pl-9 w-full"
              />
            </div>
            <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="all">All sources</option>
              {Object.entries(SOURCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="booked">Booked</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Source</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8" style={{ color: 'var(--ink-faint)' }}>No enquiries match.</td></tr>
                )}
                {filtered.map((e) => {
                  const tone = STATUS_TONE[e.status];
                  return (
                    <tr key={e.id} className="cursor-pointer" onClick={() => setSel(e)}>
                      <td>
                        <div className="font-semibold text-sm">{e.full_name}</div>
                        <div className="text-xs" style={{ color: 'var(--ink-faint)' }}>{e.email}</div>
                      </td>
                      <td><span className="badge">{SOURCE_LABEL[e.source] ?? e.source}</span></td>
                      <td className="text-sm">{e.company_name ?? <span style={{ color: 'var(--ink-faint)' }}>—</span>}</td>
                      <td>
                        <span className="badge" style={{ background: tone.bg, color: tone.fg }}>{e.status}</span>
                      </td>
                      <td className="text-xs" style={{ color: 'var(--ink-faint)' }}>{new Date(e.created_at).toLocaleString('en-GB')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div>
        {sel ? (
          <DetailPanel
            enquiry={sel}
            onStatus={(s) => update(sel.id, { status: s })}
            onNotes={(n)  => update(sel.id, { notes: n })}
            onClose={() => setSel(null)}
          />
        ) : (
          <div className="card p-6 text-center" style={{ color: 'var(--ink-faint)' }}>
            <p className="text-sm">Select an enquiry to view full details.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailPanel({
  enquiry, onStatus, onNotes, onClose,
}: {
  enquiry: Enquiry;
  onStatus: (s: Enquiry['status']) => void;
  onNotes:  (n: string) => void;
  onClose:  () => void;
}) {
  const [notes, setNotes] = useState(enquiry.notes ?? '');

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>
            {SOURCE_LABEL[enquiry.source] ?? enquiry.source}
          </p>
          <h2 className="font-display text-xl font-bold">{enquiry.full_name}</h2>
        </div>
        <button onClick={onClose} className="btn-ghost btn-sm">Close</button>
      </div>

      <div className="space-y-2 mb-4">
        <p className="text-sm flex items-center gap-2"><Mail size={13} /> <a href={`mailto:${enquiry.email}`} className="hover:underline">{enquiry.email}</a></p>
        {enquiry.phone && (
          <p className="text-sm flex items-center gap-2"><Phone size={13} /> <a href={`tel:${enquiry.phone}`} className="hover:underline">{enquiry.phone}</a></p>
        )}
        {enquiry.company_name && (
          <p className="text-sm flex items-center gap-2"><Building2 size={13} /> {enquiry.company_name}</p>
        )}
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          {new Date(enquiry.created_at).toLocaleString('en-GB')}
        </p>
      </div>

      <div className="mb-4">
        <p className="label mb-2">Status</p>
        <div className="flex flex-wrap gap-1.5">
          {(['new', 'contacted', 'booked', 'closed'] as const).map((s) => {
            const on = enquiry.status === s;
            return (
              <button
                key={s}
                onClick={() => onStatus(s)}
                className="text-[11px] font-semibold px-2.5 py-1 rounded uppercase tracking-wider"
                style={{
                  background: on ? 'var(--purple)' : 'var(--surface-alt)',
                  color:      on ? '#fff'          : 'var(--ink-soft)',
                }}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      {enquiry.result && Object.keys(enquiry.result).length > 0 && (
        <div className="mb-4">
          <p className="label mb-2">Result</p>
          <pre className="text-[11px] p-3 rounded-md overflow-auto max-h-72" style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)' }}>
{JSON.stringify(enquiry.result, null, 2)}
          </pre>
        </div>
      )}

      <div className="mb-4">
        <p className="label mb-2">Internal notes</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => { if (notes !== (enquiry.notes ?? '')) onNotes(notes); }}
          rows={4}
          className="input w-full"
          placeholder="Notes for the team…"
        />
      </div>

      <a
        href={`mailto:${enquiry.email}?subject=${encodeURIComponent(`Re: your ${SOURCE_LABEL[enquiry.source] ?? 'enquiry'}`)}`}
        className="btn-cta w-full justify-center"
      >
        Reply by email <ExternalLink size={13} />
      </a>
    </div>
  );
}
