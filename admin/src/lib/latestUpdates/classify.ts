import type { SupabaseClient } from '@supabase/supabase-js';
import { askJev } from '@/lib/jev/client';
import { notify } from '@/lib/notify/notify';
import { readAllPages } from '@/lib/supabase/paged';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import {
  isBroadcastableCategory, REGULATORY_CATEGORY_LABELS, REGULATORY_CLASSIFY_GATE,
  regulatoryChangeQuestions, regulatoryChangeState, toRegulatoryClassification, type RegulatoryCategory,
} from './regulatoryChange';

// Regulatory-change broadcast, daily cron (lib/automation, classify-updates
// route): classify unclassified published "Latest Updates" items, and —
// only when Jev is confident it IS a regulatory change AND at least one
// client's own register already holds that category — tell STAFF, never
// a client. A human decides whether and to whom to broadcast, from the
// existing /broadcast page (?update=<id> pre-fills it).
//
// This never writes compliance_items, actions or a client notification —
// classifyUpdates.test.ts asserts the only writes are to latest_updates
// and notifications (staff audience only).

const BATCH_CAP = 25;

export interface ClassifyTally {
  candidates: number; classified: number; regulatory_changes: number; notified: number; jev_calls: number; errors: string[];
}

export async function runClassifyUpdates(sb: SupabaseClient, opts: { now?: Date } = {}): Promise<ClassifyTally> {
  const now = opts.now ?? new Date();
  const tally: ClassifyTally = { candidates: 0, classified: 0, regulatory_changes: 0, notified: 0, jev_calls: 0, errors: [] };

  const { data: rows, error } = await sb.from('latest_updates')
    .select('id, title, description')
    .eq('status', 'published')
    .is('regulatory_classified_at', null)
    .order('published_at', { ascending: false })
    .limit(BATCH_CAP);
  if (error) { tally.errors.push(`latest_updates: ${error.message}`); return tally; }
  const candidates = (rows ?? []) as { id: string; title: string; description: string | null }[];
  tally.candidates = candidates.length;
  if (candidates.length === 0) return tally;

  for (const row of candidates) {
    const r = await askJev(sb, {
      kind: 'latest_update_regulatory_change', companyId: null, entityType: 'latest_update', entityId: row.id,
      actor: { id: null, kind: 'system' }, flags: null,
      state: regulatoryChangeState(row.title, row.description),
      questions: regulatoryChangeQuestions(), gate: REGULATORY_CLASSIFY_GATE,
    });
    if (r && !r.cached) tally.jev_calls++;

    const selected = r && !r.gated
      ? {
          is_regulatory_change: r.answers.is_regulatory_change?.type === 'noul' ? r.answers.is_regulatory_change.probability : undefined,
          category: r.answers.category?.type === 'choice' ? r.answers.category.selected : undefined,
        }
      : {};
    const parsed = r && !r.gated ? toRegulatoryClassification(selected, r.confidence) : null;

    // Off, gated, unrecognised or "not a change": recorded as 'none' so
    // the row is never reconsidered — reprocessing it every day forever
    // would be free but pointless, and 'none' is a real, honest answer
    // ("classified, does not apply"), not a placeholder for "unknown".
    const category: RegulatoryCategory = (parsed && parsed.isChange && isBroadcastableCategory(parsed.category)) ? parsed.category : 'none';
    const confidence = parsed?.confidence ?? null;

    const upd = await sb.from('latest_updates').update({
      regulatory_category: category, regulatory_confidence: confidence, regulatory_classified_at: now.toISOString(),
    }, COUNT_EXACT).eq('id', row.id).is('regulatory_classified_at', null);
    const w = judgeWrite({ error: upd.error, count: upd.count });
    if (!w.ok) { tally.errors.push(`${row.id}: ${w.message}`); continue; }
    tally.classified++;
    if (category === 'none') continue;
    tally.regulatory_changes++;

    // Only ever a RECOMMENDATION: staff decide from /broadcast whether,
    // and to whom, to send anything. Nothing here touches a client.
    const affected = await readAllPages<{ company_id: string }>((from, to) =>
      sb.from('compliance_items').select('company_id').eq('category', category).order('id').range(from, to));
    const affectedCount = new Set(affected.rows.map(a => a.company_id)).size;
    if (affectedCount === 0) continue;

    await notify(sb, {
      audiences: [{ kind: 'staff' }], companyId: null, type: 'regulatory_change_detected',
      title: `Possible regulatory change: ${row.title}`.slice(0, 200),
      body: `Jev suggests this affects ${REGULATORY_CATEGORY_LABELS[category]} — ${affectedCount} client${affectedCount === 1 ? '' : 's'} hold a register item in that category. Review and broadcast if it applies.`,
      link: { admin: `/broadcast?update=${row.id}` },
      dedupeKey: `regulatory_change:${row.id}`,
    });
    tally.notified++;
  }
  return tally;
}
