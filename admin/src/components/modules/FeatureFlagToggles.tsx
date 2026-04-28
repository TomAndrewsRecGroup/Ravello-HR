'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, ChevronDown, X,
  Briefcase, BookOpen, ShieldCheck, Settings, Trophy,
  AlertTriangle, CheckCircle2, PoundSterling,
} from 'lucide-react';
import { FLAG_GROUPS, hasPaidFlag, type FlagGroup } from '@/lib/featureFlags';

interface Props {
  companyId:                string;
  flags:                    Record<string, boolean>;
  monthlyRetainerPence?:    number | null;
  subscriptionStatus?:      string | null;
}

const GROUP_ICON: Record<string, typeof Briefcase> = {
  HIRE:       Briefcase,
  LEAD:       BookOpen,
  PROTECT:    ShieldCheck,
  General:    Settings,
  Programmes: Trophy,
};

// Module access editor + integrated retainer flow.
//
// Replaces the old "save on every toggle" behaviour with a dirty-
// tracked editor: changes accumulate locally, the user clicks Save
// once, and if the result has paid modules enabled we open a retainer
// modal that hits /api/admin/clients/[id]/retainer to update the
// Stripe price+subscription. This consolidates the old Services tab
// (which was the only place the retainer was visible).

export default function FeatureFlagToggles({
  companyId,
  flags,
  monthlyRetainerPence,
  subscriptionStatus,
}: Props) {
  const router = useRouter();

  const [savedFlags, setSavedFlags]     = useState<Record<string, boolean>>(flags);
  const [draftFlags, setDraftFlags]     = useState<Record<string, boolean>>(flags);
  const [collapsed,  setCollapsed]      = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of FLAG_GROUPS) {
      init[g.label] = g.flags.every(f => !flags[f.key]);
    }
    return init;
  });
  const [saving, setSaving]             = useState(false);
  const [error,  setError]              = useState('');
  const [retainerOpen, setRetainerOpen] = useState(false);

  const dirty = useMemo(() => {
    const keys = new Set([...Object.keys(savedFlags), ...Object.keys(draftFlags)]);
    for (const k of Array.from(keys)) {
      if (!!savedFlags[k] !== !!draftFlags[k]) return true;
    }
    return false;
  }, [savedFlags, draftFlags]);

  const draftPaid = useMemo(() => hasPaidFlag(draftFlags), [draftFlags]);

  function toggle(key: string) {
    setDraftFlags(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleGroup(group: FlagGroup, on: boolean) {
    setDraftFlags(prev => {
      const next = { ...prev };
      for (const f of group.flags) next[f.key] = on;
      return next;
    });
  }

  function toggleCollapse(label: string) {
    setCollapsed(prev => ({ ...prev, [label]: !prev[label] }));
  }

  function discard() {
    setDraftFlags(savedFlags);
    setError('');
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      // Server route uses the service-role client + revalidateTag, so
      // the write is guaranteed (no RLS surprises) and the admin's
      // /clients/[id] cache is flushed before the next render.
      const res = await fetch(`/api/admin/clients/${companyId}/feature-flags`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ feature_flags: draftFlags }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');

      setSavedFlags(draftFlags);
      router.refresh();

      // If paid modules are enabled in the new state, prompt the admin
      // to set / confirm the retainer. Even if it's unchanged from
      // before — the act of saving is a good moment to verify the
      // billing matches the access.
      if (draftPaid) {
        setRetainerOpen(true);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const totalOn    = Object.values(draftFlags).filter(Boolean).length;
  const totalFlags = FLAG_GROUPS.reduce((s, g) => s + g.flags.length, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pb-2">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Module access</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>
            {totalOn} of {totalFlags} features enabled
            {dirty && <span className="ml-2 px-1.5 py-px rounded text-[10px] font-bold" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--amber)' }}>UNSAVED</span>}
          </p>
        </div>
      </div>

      {FLAG_GROUPS.map(group => {
        const groupOn      = group.flags.filter(f => !!draftFlags[f.key]).length;
        const groupTotal   = group.flags.length;
        const isCollapsed  = collapsed[group.label];
        const allOn        = groupOn === groupTotal;
        const noneOn       = groupOn === 0;
        const Icon         = GROUP_ICON[group.label] ?? Settings;
        const pct          = groupTotal === 0 ? 0 : (groupOn / groupTotal) * 100;
        const isFree       = group.tier === 'free';

        const accent = noneOn ? 'var(--ink-faint)' : 'var(--purple)';
        const iconBg = noneOn ? 'var(--surface-soft)' : 'rgba(124,58,237,0.08)';

        return (
          <div
            key={group.label}
            className="card overflow-hidden"
            style={{
              transition: 'border-color 150ms, box-shadow 150ms',
              borderColor: !isCollapsed && !noneOn ? 'rgba(124,58,237,0.18)' : 'var(--line)',
            }}
          >
            <button
              type="button"
              onClick={() => toggleCollapse(group.label)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-soft)] transition-colors"
            >
              <div className="flex-shrink-0 w-9 h-9 rounded-[10px] flex items-center justify-center" style={{ background: iconBg, color: accent }}>
                <Icon size={17} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold tracking-tight" style={{ color: 'var(--ink)' }}>{group.label}</p>
                  {isFree && (
                    <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded-md" style={{ background: 'rgba(20,184,166,0.10)', color: 'var(--teal)' }}>Free</span>
                  )}
                </div>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--ink-faint)' }}>{group.description}</p>
              </div>
              <div className="flex-shrink-0 flex items-center gap-3">
                <div className="hidden sm:flex flex-col items-end gap-1">
                  <span className="text-[10px] font-semibold" style={{ color: noneOn ? 'var(--ink-faint)' : 'var(--ink-soft)' }}>
                    {groupOn}/{groupTotal}
                  </span>
                  <div className="w-20 h-1 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                    <div className="h-full transition-all duration-300" style={{ width: `${pct}%`, background: allOn ? 'var(--teal)' : 'var(--purple)' }} />
                  </div>
                </div>
                <ChevronDown size={16} className="transition-transform duration-200" style={{ color: 'var(--ink-faint)', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }} />
              </div>
            </button>

            {!isCollapsed && (
              <div className="border-t px-4 py-3 space-y-2" style={{ borderColor: 'var(--line)', background: 'var(--surface-soft)' }}>
                <div className="flex items-center justify-between pb-2 mb-1" style={{ borderBottom: '1px dashed var(--line)' }}>
                  <span className="text-[11px] font-medium" style={{ color: 'var(--ink-soft)' }}>Bulk actions</span>
                  <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                    <button onClick={() => toggleGroup(group, true)} disabled={allOn} className="text-[10px] font-bold px-2.5 py-1 rounded-md transition-all hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: 'rgba(20,184,166,0.10)', color: 'var(--teal)' }}>Enable all</button>
                    <button onClick={() => toggleGroup(group, false)} disabled={noneOn} className="text-[10px] font-bold px-2.5 py-1 rounded-md transition-all hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: 'rgba(217,68,68,0.08)', color: 'var(--red)' }}>Disable all</button>
                  </div>
                </div>

                {group.flags.map(flag => {
                  const on = !!draftFlags[flag.key];
                  return (
                    <div key={flag.key} className="flex items-center justify-between py-1.5 px-1 rounded-md hover:bg-white transition-colors">
                      <p className="text-[13px] font-medium" style={{ color: on ? 'var(--ink)' : 'var(--ink-faint)' }}>{flag.label}</p>
                      <button onClick={() => toggle(flag.key)} aria-label={`Toggle ${flag.label}`} className="flex items-center">
                        <div className={`toggle ${on ? 'toggle-on' : 'toggle-off'}`}>
                          <div className={`toggle-knob ${on ? 'toggle-knob-on' : 'toggle-knob-off'}`} />
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Save bar — pinned at the bottom of the panel when dirty. */}
      {dirty && (
        <div className="sticky bottom-0 -mx-1 mt-3 p-3 rounded-[12px] flex items-center justify-between gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: '0 -2px 12px rgba(7,11,29,0.05)' }}>
          <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>You have unsaved changes</p>
          <div className="flex items-center gap-2">
            <button onClick={discard} disabled={saving} className="btn-secondary btn-sm">Discard</button>
            <button onClick={save} disabled={saving} className="btn-cta btn-sm">
              {saving ? <Loader2 size={13} className="animate-spin" /> : null}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs p-2.5 rounded-[8px]" style={{ background: 'rgba(217,68,68,0.08)', color: 'var(--red)' }}>{error}</p>}

      {retainerOpen && (
        <RetainerModal
          companyId={companyId}
          currentPence={monthlyRetainerPence ?? null}
          subscriptionStatus={subscriptionStatus ?? null}
          onClose={() => setRetainerOpen(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Retainer modal — opens after a successful Save when paid modules
// are enabled. POSTs to the existing retainer endpoint which handles
// Stripe price/subscription updates.
// ─────────────────────────────────────────────────────────────────

interface RetainerProps {
  companyId:           string;
  currentPence:        number | null;
  subscriptionStatus:  string | null;
  onClose:             () => void;
}

function RetainerModal({ companyId, currentPence, subscriptionStatus, onClose }: RetainerProps) {
  const router = useRouter();
  const [pounds, setPounds] = useState(
    currentPence !== null && currentPence > 0 ? (currentPence / 100).toFixed(2) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const [done,   setDone]   = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const n = parseFloat(pounds);
    const pence = !isNaN(n) && n >= 0 ? Math.round(n * 100) : null;

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/clients/${companyId}/retainer`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ monthly_retainer_pence: pence }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to update retainer');
      setDone(true);
      router.refresh();
      setTimeout(onClose, 1200);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update retainer');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(7,11,29,0.45)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] rounded-[16px] p-6"
        style={{ background: '#FFFFFF', border: '1px solid var(--line)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <PoundSterling size={14} style={{ color: 'var(--purple)' }} />
            <h3 className="font-display text-base font-semibold" style={{ color: 'var(--ink)' }}>Update monthly retainer</h3>
          </div>
          <button onClick={onClose} className="btn-icon btn-ghost" aria-label="Close">
            <X size={14} />
          </button>
        </div>

        {done ? (
          <div className="flex items-center gap-2 p-3 rounded-[10px]" style={{ background: 'rgba(20,184,166,0.10)', color: 'var(--teal)' }}>
            <CheckCircle2 size={16} />
            <p className="text-sm font-medium">Retainer updated. Stripe will apply on the next invoice.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
              Module access has changed for this client. Confirm the monthly retainer below — Stripe will adjust the subscription on the next billing cycle.
            </p>

            {currentPence !== null && currentPence > 0 && (
              <div className="rounded-[10px] p-3 text-xs" style={{ background: 'var(--surface-soft)', color: 'var(--ink-soft)' }}>
                Current: <strong style={{ color: 'var(--ink)' }}>£{(currentPence / 100).toFixed(2)}</strong> / month
                {subscriptionStatus && <span className="ml-2 text-[11px]">· {subscriptionStatus}</span>}
              </div>
            )}

            <div className="form-group">
              <label className="label">New monthly retainer (£)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium" style={{ color: 'var(--ink-faint)' }}>£</span>
                <input
                  type="number" min="0" step="0.01"
                  className="input"
                  style={{ paddingLeft: 24 }}
                  value={pounds}
                  onChange={e => setPounds(e.target.value)}
                  placeholder="2500.00"
                  autoFocus
                />
              </div>
              <p className="text-[11px] mt-1.5" style={{ color: 'var(--ink-faint)' }}>
                Leave blank or set 0 to keep the current Stripe sub running with no change.
              </p>
            </div>

            {error && (
              <p className="text-xs p-2.5 rounded-[8px] flex items-start gap-2" style={{ background: 'rgba(217,68,68,0.08)', color: 'var(--red)' }}>
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} disabled={saving} className="btn-secondary btn-sm">Skip for now</button>
              <button type="submit" disabled={saving} className="btn-cta btn-sm">
                {saving ? <Loader2 size={13} className="animate-spin" /> : null}
                {saving ? 'Updating…' : 'Update retainer'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
