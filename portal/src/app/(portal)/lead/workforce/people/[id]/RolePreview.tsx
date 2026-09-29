'use client';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { previewSummary, type RolePreviewRow } from '@/lib/workforce/profile';
import { REQUIREMENT_TYPE_LABELS, type RequirementType } from '@/lib/workforce/vocab';
import type { RoleOption } from './rows';

// "What would this role add?" (spec 87). The database compares the
// role's rules in force today with what the person already has to meet
// (136 role_change_preview). Nothing is changed by previewing.
export default function RolePreview({ personId, roles }: { personId: string; roles: RoleOption[] }) {
  const [roleId, setRoleId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<RolePreviewRow[] | null>(null);

  async function preview() {
    if (!roleId) return;
    setBusy(true); setError(null); setRows(null);
    const { data, error: e } = await createClient().rpc('role_change_preview', { p_person: personId, p_role: roleId });
    setBusy(false);
    if (e) { setError(e.message); return; }
    setRows((data ?? []) as RolePreviewRow[]);
  }

  const s = rows ? previewSummary(rows) : null;
  const label = (t: string) => REQUIREMENT_TYPE_LABELS[t as RequirementType] ?? t;

  return (
    <div className="space-y-2 no-print">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-[220px]"><span className="label">Preview a role change</span>
          <select className="input" value={roleId} onChange={e => { setRoleId(e.target.value); setRows(null); }}>
            <option value="">Choose a role…</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        </label>
        <button type="button" className="btn-secondary btn-sm" onClick={preview} disabled={!roleId || busy}>
          {busy && <Loader2 size={12} className="animate-spin" />} Preview
        </button>
      </div>
      {error && <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      {s && (
        <div role="status" className="text-sm space-y-2">
          <p className="font-medium" style={{ color: 'var(--ink)' }}>{s.sentence}</p>
          {s.newMandatory.length > 0 && (
            <ul className="list-disc pl-5 space-y-0.5" style={{ color: 'var(--ink-soft)' }}>
              {s.newMandatory.map((r, i) => (
                <li key={`${r.requirement_type}-${r.reference_id ?? r.reference_key}-${i}`}>
                  {label(r.requirement_type)}: {r.name ?? '—'}{r.safety_critical ? ' — safety-critical' : ''}
                </li>
              ))}
            </ul>
          )}
          {s.newOptional.length > 0 && (
            <p style={{ color: 'var(--ink-faint)' }}>Also {s.newOptional.length} optional requirement{s.newOptional.length === 1 ? '' : 's'}: {s.newOptional.map(r => r.name ?? label(r.requirement_type)).join(', ')}.</p>
          )}
          {s.alreadyCovered > 0 && (
            <p style={{ color: 'var(--ink-faint)' }}>{s.alreadyCovered} of the role’s requirement{s.alreadyCovered === 1 ? ' is' : 's are'} already required of this person.</p>
          )}
          {rows && rows.length === 0 && <p style={{ color: 'var(--ink-faint)' }}>This role has no requirements in force today.</p>}
        </div>
      )}
    </div>
  );
}
