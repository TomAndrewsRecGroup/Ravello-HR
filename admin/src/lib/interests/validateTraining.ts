// Mirror of `validate.ts` (partner interests) but for training
// interests — different table, different status enum, different field
// names. Kept as a separate file rather than a generic so each list
// can evolve independently (training adds 'enrolled'/'completed').
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TRAINING_STATUSES = ['interested', 'enrolled', 'completed', 'passed'] as const;
export type TrainingStatus = (typeof TRAINING_STATUSES)[number];

export interface BulkTrainingItem {
  provider_id: string;
  offering_id: string | null;
}

export interface BulkTrainingBody {
  athlete_id: string;
  items: BulkTrainingItem[];
}

export function parseBulkBody(raw: unknown):
  | { ok: true; value: BulkTrainingBody }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'invalid body' };
  const b = raw as Record<string, unknown>;
  if (typeof b.athlete_id !== 'string' || !UUID_RE.test(b.athlete_id)) {
    return { ok: false, error: 'athlete_id required' };
  }
  if (!Array.isArray(b.items) || b.items.length === 0) {
    return { ok: false, error: 'items must be a non-empty array' };
  }
  if (b.items.length > 100) {
    return { ok: false, error: 'too many items (max 100)' };
  }
  const items: BulkTrainingItem[] = [];
  const seen = new Set<string>();
  for (const raw of b.items) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'invalid item' };
    const it = raw as Record<string, unknown>;
    if (typeof it.provider_id !== 'string' || !UUID_RE.test(it.provider_id)) {
      return { ok: false, error: 'item.provider_id required' };
    }
    const offering = it.offering_id;
    if (offering !== null && (typeof offering !== 'string' || !UUID_RE.test(offering))) {
      return { ok: false, error: 'item.offering_id must be uuid or null' };
    }
    const key = `${it.provider_id}::${offering ?? 'null'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ provider_id: it.provider_id, offering_id: offering as string | null });
  }
  return { ok: true, value: { athlete_id: b.athlete_id, items } };
}

export function parsePatch(raw: unknown):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'invalid body' };
  const b = raw as Record<string, unknown>;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.status !== undefined) {
    if (typeof b.status !== 'string' || !TRAINING_STATUSES.includes(b.status as TrainingStatus)) {
      return { ok: false, error: 'invalid status' };
    }
    patch.status = b.status;
  }
  if (b.notes !== undefined) {
    if (b.notes === null) patch.notes = null;
    else if (typeof b.notes === 'string') patch.notes = b.notes.slice(0, 2000);
    else return { ok: false, error: 'invalid notes' };
  }
  return { ok: true, value: patch };
}
