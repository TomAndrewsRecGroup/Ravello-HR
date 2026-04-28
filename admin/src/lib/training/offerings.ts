import { randomUUID } from 'crypto';

export interface TrainingOffering {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  /** Free text label like "Course", "Workshop", "Webinar"; not enforced. */
  format?: string | null;
  url?: string | null;
}

export type ValidationResult =
  | { ok: true; value: TrainingOffering[] }
  | { ok: false; error: string };

// Validates and stable-IDs the JSONB array of training offerings on
// `training_providers.offerings`. Mirrors the partner role normaliser
// (admin/src/lib/partners/roleOpportunities.ts) so the two channels
// stay in sync — the only structural difference is the optional
// `format` field.
export function normaliseTrainingOfferings(
  raw: unknown,
  existing: TrainingOffering[] = [],
): ValidationResult {
  if (raw === undefined) return { ok: true, value: existing };
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'offerings must be an array' };
  }

  const existingIds = new Set(existing.map(e => e.id));
  const out: TrainingOffering[] = [];
  const seenIds = new Set<string>();

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      return { ok: false, error: 'offering entries must be objects' };
    }
    const e = entry as Record<string, unknown>;
    const title = typeof e.title === 'string' ? e.title.trim() : '';
    if (!title) {
      return { ok: false, error: 'every offering needs a title' };
    }

    const incomingId = typeof e.id === 'string' && e.id.length > 0 ? e.id : null;
    const id = incomingId && existingIds.has(incomingId)
      ? incomingId
      : (incomingId && /^[0-9a-f-]{36}$/i.test(incomingId) ? incomingId : randomUUID());

    if (seenIds.has(id)) {
      return { ok: false, error: 'duplicate offering id' };
    }
    seenIds.add(id);

    const url = typeof e.url === 'string' ? e.url.trim() : '';
    if (url) {
      try {
        const u = new URL(url);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          return { ok: false, error: 'offering url must be http(s)' };
        }
      } catch {
        return { ok: false, error: 'invalid offering url' };
      }
    }

    out.push({
      id,
      title: title.slice(0, 200),
      description: typeof e.description === 'string' && e.description.trim()
        ? e.description.trim().slice(0, 2000) : null,
      location: typeof e.location === 'string' && e.location.trim()
        ? e.location.trim().slice(0, 200) : null,
      format: typeof e.format === 'string' && e.format.trim()
        ? e.format.trim().slice(0, 100) : null,
      url: url || null,
    });
  }

  return { ok: true, value: out };
}
