'use client';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { revalidateAdminPath } from '@/app/actions';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';

// Core-OS 360 Phase 3 (137): the client's WORKFORCE job role this
// vacancy fills. When the hire becomes an employee, the database gives
// them one primary assignment to this role and opens the role's
// pre-employment checks. A requisition without one is hired exactly as
// before (no assignment; the client assigns a role on the workforce
// pages). Only this client's roles are offered; the trigger checks the
// company again.

interface Props {
  requisitionId: string;
  current: string | null;
  roles: { id: string; title: string; active_status: string; safety_critical: boolean }[];
}

export default function WorkforceRoleLink({ requisitionId, current, roles }: Props) {
  const supabase = createClient();
  const [value, setValue] = useState(current ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(next: string) {
    setValue(next);
    setSaving(true);
    setMessage(null);
    const res = await supabase.from('requisitions').update({ job_role_id: next || null }, COUNT_EXACT).eq('id', requisitionId);
    const out = judgeWrite({ error: res.error, count: res.count }, 'The workforce role');
    setSaving(false);
    if (!out.ok) { setMessage(out.message); setValue(current ?? ''); return; }
    setMessage('Saved');
    revalidateAdminPath(`/hiring/${requisitionId}`);
  }

  return (
    <div className="card p-5">
      <h3 className="font-display font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>Workforce role</h3>
      <p className="text-xs mb-3" style={{ color: 'var(--ink-faint)' }}>
        The client&apos;s job role this vacancy fills. The person hired is assigned to it automatically, with its
        pre-employment checks. Hiring never makes anyone ready to deploy on its own.
      </p>
      {roles.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>This client has no workforce roles yet.</p>
      ) : (
        <div className="flex items-center gap-2">
          <label htmlFor="workforce-role" className="sr-only">Workforce role</label>
          <select id="workforce-role" className="input flex-1" value={value} disabled={saving} onChange={e => save(e.target.value)}>
            <option value="">None</option>
            {roles.map(r => (
              <option key={r.id} value={r.id} disabled={r.active_status !== 'active' && r.id !== current}>
                {r.title}{r.safety_critical ? ' (safety-critical)' : ''}{r.active_status !== 'active' ? ` — ${r.active_status}` : ''}
              </option>
            ))}
          </select>
          {saving && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--purple)' }} />}
        </div>
      )}
      {message && <p className="text-xs mt-2" role="status" style={{ color: message === 'Saved' ? 'var(--teal)' : 'var(--red)' }}>{message}</p>}
    </div>
  );
}
