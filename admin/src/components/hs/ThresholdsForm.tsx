'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Loader2, Settings2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/modules/Toast';

export interface ThresholdsRow {
  audit_score_low_threshold: number | null;
  evidence_red_threshold: number | null;
  evidence_amber_threshold: number | null;
  objectives_on_track_amber_threshold: number | null;
  waste_non_conformance_amber_threshold: number | null;
}

const DEFAULTS: ThresholdsRow = {
  audit_score_low_threshold: 70,
  evidence_red_threshold: 50,
  evidence_amber_threshold: 90,
  objectives_on_track_amber_threshold: 50,
  waste_non_conformance_amber_threshold: 10,
};

const FIELDS: { key: keyof ThresholdsRow; label: string }[] = [
  { key: 'audit_score_low_threshold', label: 'Audit score below (%)' },
  { key: 'evidence_red_threshold', label: 'Evidence coverage red below (%)' },
  { key: 'evidence_amber_threshold', label: 'Evidence coverage amber below (%)' },
  { key: 'objectives_on_track_amber_threshold', label: 'Objectives on-track amber below (%)' },
  { key: 'waste_non_conformance_amber_threshold', label: 'Waste non-conformance amber above (%)' },
];

// Core-OS 360 Completion Programme, Phase 23, Group 5 (closes
// gap-ledger row C12.5 — "configurable thresholds, safe defaults,
// audited"). A staff session may write directly under RLS
// (compliance_twin_thresholds_staff_all, 189) — no API route needed,
// the same "session insert/upsert under RLS" pattern
// SaveSnapshotButton.tsx/ContractorsClient.tsx already use. Every
// field left BLANK means "use the documented default" (shown as
// placeholder text, never pre-filled as if it were an explicit
// override) — the form never writes a guessed number, only what
// staff actually typed.
export default function ThresholdsForm({ companyId, existing }: {
  companyId: string;
  existing: ThresholdsRow | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState<Record<keyof ThresholdsRow, string>>(() => {
    const out = {} as Record<keyof ThresholdsRow, string>;
    for (const f of FIELDS) out[f.key] = existing?.[f.key] != null ? String(existing[f.key]) : '';
    return out;
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data: auth } = await createClient().auth.getUser();
    const payload: Record<string, unknown> = { company_id: companyId, updated_by: auth.user?.id ?? null };
    for (const f of FIELDS) {
      const raw = values[f.key].trim();
      const n = Number(raw);
      payload[f.key] = raw === '' || Number.isNaN(n) ? null : n;
    }
    const { error } = await createClient().from('compliance_twin_thresholds').upsert(payload, { onConflict: 'company_id' });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Thresholds saved', 'success');
    router.refresh();
  }

  return (
    <section className="card p-4 space-y-3">
      <button type="button" className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--ink)' }} onClick={() => setOpen(o => !o)}>
        <Settings2 size={16} /> Thresholds {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <form onSubmit={save} className="space-y-2">
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
            Leave a field blank to use the documented default. Deciding these thresholds decides what this client sees as
            red/amber/green — every change is audited.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {FIELDS.map(f => (
              <label key={f.key} className="block">
                <span className="label text-xs">{f.label}</span>
                <input
                  type="number" className="input" placeholder={String(DEFAULTS[f.key])}
                  value={values[f.key]} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <button type="submit" className="btn-cta btn-sm" disabled={busy}>
            {busy && <Loader2 size={14} className="animate-spin" />} Save thresholds
          </button>
        </form>
      )}
    </section>
  );
}
