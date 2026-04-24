export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const INTEREST_STATUSES = ['interested', 'introduced', 'passed'] as const;
export type InterestStatus = (typeof INTEREST_STATUSES)[number];

export interface BulkInterestItem {
  partner_id: string;
  role_opportunity_id: string | null;
}

export interface BulkInterestBody {
  athlete_id: string;
  items: BulkInterestItem[];
}

export function parseBulkBody(raw: unknown):
  | { ok: true; value: BulkInterestBody }
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
  const items: BulkInterestItem[] = [];
  const seen = new Set<string>();
  for (const raw of b.items) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'invalid item' };
    const it = raw as Record<string, unknown>;
    if (typeof it.partner_id !== 'string' || !UUID_RE.test(it.partner_id)) {
      return { ok: false, error: 'item.partner_id required' };
    }
    const role = it.role_opportunity_id;
    if (role !== null && (typeof role !== 'string' || !UUID_RE.test(role))) {
      return { ok: false, error: 'item.role_opportunity_id must be uuid or null' };
    }
    const key = `${it.partner_id}::${role ?? 'null'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ partner_id: it.partner_id, role_opportunity_id: role as string | null });
  }
  return { ok: true, value: { athlete_id: b.athlete_id, items } };
}

export interface InterestPatchBody {
  status?: InterestStatus;
  notes?: string | null;
}

export function parsePatch(raw: unknown):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'invalid body' };
  const b = raw as Record<string, unknown>;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.status !== undefined) {
    if (typeof b.status !== 'string' || !INTEREST_STATUSES.includes(b.status as InterestStatus)) {
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
