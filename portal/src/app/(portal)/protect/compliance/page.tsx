import type { Metadata } from 'next';
import { AlertTriangle, CheckCircle2, Clock, ShieldCheck } from 'lucide-react';
import { createServerSupabaseClient, getSessionProfile } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase/paged';
import { describeRecurrence, daysUntil, ragFor, type Rag } from '@/lib/hs/recurrence';
import { HS_COMPLETION_OUTCOME_LABELS, HS_REGISTER_CATEGORY_LABELS, domainOf } from '@/lib/hs/vocab';
import type { HsCompletion, HsFile, HsRegisterItem } from '@/lib/hs/types';
import EvidenceLinks from '@/components/hs/EvidenceLinks';

export const metadata: Metadata = { title: 'H&S Register' };
export const dynamic = 'force-dynamic';

// The client's Health & Safety register: every statutory and recurring
// item, when it was last done, when it is next due, the outcome and the
// evidence. Recorded by Core OS 360 and the client's H&S providers
// (a client cannot mark an item done: nothing here is self-certified).
// HR compliance items, which are not part of the H&S register, are
// listed separately underneath.

const RAG: Record<Rag, { label: string; colour: string; icon: React.ElementType }> = {
  red:      { label: 'Overdue',  colour: 'var(--danger)',    icon: AlertTriangle },
  amber:    { label: 'Due soon', colour: 'var(--amber)',     icon: Clock },
  green:    { label: 'On track', colour: 'var(--success)',   icon: ShieldCheck },
  complete: { label: 'Complete', colour: 'var(--ink-faint)', icon: CheckCircle2 },
  none:     { label: 'No date',  colour: 'var(--ink-faint)', icon: Clock },
};

const fmt = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

const categoryLabel = (c: string | null) =>
  (c && (HS_REGISTER_CATEGORY_LABELS as Record<string, string>)[c])
  || (c === 'health_safety' ? 'Health & safety' : (c ?? 'Other').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));

function dueText(item: HsRegisterItem): string {
  if (item.status === 'complete') return item.last_completed_on ? `Done ${fmt(item.last_completed_on)}` : 'Complete';
  if (!item.due_date) return 'No due date';
  const d = daysUntil(item.due_date);
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} overdue`;
  if (d === 0) return 'Due today';
  if (d <= 7) return `Due in ${d} day${d === 1 ? '' : 's'}`;
  return `Due ${fmt(item.due_date)}`;
}

export default async function HsRegisterPage() {
  const supabase = createServerSupabaseClient();
  const { companyId } = await getSessionProfile();

  const [items, completions, files] = await Promise.all([
    readAllPages<HsRegisterItem>((from, to) =>
      supabase.from('compliance_items')
        .select('id, company_id, title, description, category, status, due_date, recurrence_every, recurrence_unit, last_completed_on, legal_basis, source, site_id')
        .eq('company_id', companyId)
        .order('due_date', { ascending: true, nullsFirst: false }).order('id')
        .range(from, to)),
    readAllPages<HsCompletion>((from, to) =>
      supabase.from('hs_register_completions')
        .select('id, item_id, completed_on, outcome, notes, next_due_on, recorded_by_kind, created_at')
        .eq('company_id', companyId)
        .order('completed_on', { ascending: false }).order('id')
        .range(from, to)),
    readAllPages<HsFile>((from, to) =>
      supabase.from('hs_files')
        .select('id, entity_type, entity_id, storage_path, file_name, size_bytes, created_at')
        .eq('company_id', companyId)
        .in('entity_type', ['register_item', 'register_completion'])
        .order('created_at', { ascending: false }).order('id')
        .range(from, to)),
  ]);

  const hs = items.rows.filter(i => domainOf(i.category) === 'hs');
  const hr = items.rows.filter(i => domainOf(i.category) === 'hr');
  const latestFor = new Map<string, HsCompletion>();
  for (const c of completions.rows) if (!latestFor.has(c.item_id)) latestFor.set(c.item_id, c);
  const filesFor = (item: HsRegisterItem) => {
    const latest = latestFor.get(item.id);
    return files.rows.filter(f =>
      (f.entity_type === 'register_item' && f.entity_id === item.id)
      || (latest && f.entity_type === 'register_completion' && f.entity_id === latest.id));
  };

  const counts = { red: 0, amber: 0, green: 0 };
  for (const i of hs) {
    const r = ragFor(i.status, i.due_date);
    if (r === 'red' || r === 'amber' || r === 'green') counts[r]++;
  }
  const categories = [...new Set(hs.map(i => i.category ?? 'hs_other'))]
    .sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b)));
  const loadError = items.error ?? completions.error ?? files.error;

  return (
    <main className="portal-page flex-1 space-y-8">
      {loadError && (
        <p className="card p-3 text-sm" style={{ color: 'var(--danger)' }}>Part of your register could not be loaded. Refresh to try again.</p>
      )}

      {hs.length === 0 ? (
        <div className="card p-12">
          <div className="empty-state">
            <ShieldCheck size={28} style={{ color: 'var(--teal)' }} />
            <p className="text-base font-medium" style={{ color: 'var(--ink-soft)' }}>Your H&amp;S register is empty</p>
            <p className="text-sm max-w-[340px]" style={{ color: 'var(--ink-faint)' }}>
              Core OS 360 and your H&amp;S provider add your statutory checks and recurring inspections here.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            {(['red', 'amber', 'green'] as const).map(r => {
              const Icon = RAG[r].icon;
              return (
                <div key={r} className="card p-4">
                  <p className="text-xs font-medium mb-1 flex items-center gap-1.5" style={{ color: RAG[r].colour }}><Icon size={13} aria-hidden /> {RAG[r].label}</p>
                  <p className="font-display font-bold text-2xl" style={{ color: 'var(--ink)' }}>{counts[r]}</p>
                </div>
              );
            })}
          </div>

          {categories.map(cat => (
            <section key={cat}>
              <h2 className="font-display font-semibold text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: 'var(--purple)' }} aria-hidden />
                {categoryLabel(cat)}
              </h2>
              <ul className="space-y-3">
                {hs.filter(i => (i.category ?? 'hs_other') === cat).map(item => {
                  const rag = ragFor(item.status, item.due_date);
                  const R = RAG[rag];
                  const latest = latestFor.get(item.id);
                  return (
                    <li key={item.id} className="card p-5" style={rag === 'red' ? { borderColor: 'color-mix(in srgb, var(--danger) 30%, transparent)' } : undefined}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <R.icon size={15} style={{ color: R.colour, marginTop: 2, flexShrink: 0 }} aria-hidden />
                          <div className="min-w-0">
                            <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{item.title}</p>
                            {item.description && <p className="text-sm mt-0.5" style={{ color: 'var(--ink-soft)' }}>{item.description}</p>}
                            <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>
                              {describeRecurrence(item.recurrence_every, item.recurrence_unit)}
                              {item.legal_basis && ` · ${item.legal_basis}`}
                            </p>
                          </div>
                        </div>
                        <div className="text-right text-sm">
                          <p className="font-medium" style={{ color: R.colour }}>{R.label}</p>
                          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{dueText(item)}</p>
                        </div>
                      </div>
                      {latest && (
                        <p className="text-xs mt-3 pl-7" style={{ color: 'var(--ink-soft)' }}>
                          Last done {fmt(latest.completed_on)}: {HS_COMPLETION_OUTCOME_LABELS[latest.outcome]}
                          {latest.notes && <span style={{ color: 'var(--ink-faint)' }}> · {latest.notes}</span>}
                        </p>
                      )}
                      <div className="pl-7"><EvidenceLinks files={filesFor(item)} /></div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}

      {hr.length > 0 && (
        <section>
          <h2 className="font-display font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>HR compliance</h2>
          <p className="text-xs mb-3" style={{ color: 'var(--ink-faint)' }}>Employment and HR obligations Core OS 360 tracks for you.</p>
          <ul className="card divide-y" style={{ borderColor: 'var(--line)' }}>
            {hr.map(item => {
              const R = RAG[ragFor(item.status, item.due_date)];
              return (
                <li key={item.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium truncate" style={{ color: 'var(--ink)' }}>{item.title}</span>
                    <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>{categoryLabel(item.category)}</span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-xs font-medium" style={{ color: R.colour }}>{R.label}</span>
                    <span className="block text-xs" style={{ color: 'var(--ink-faint)' }}>{dueText(item)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
