import { randomUUID } from 'crypto';

export interface RoleOpportunity {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
}

export type ValidationResult =
  | { ok: true; value: RoleOpportunity[] }
  | { ok: false; error: string };

// Accepts an array from the wire. Each entry must have a non-empty title.
// Missing IDs are filled server-side; existing IDs preserved when reachable.
// `existing` is the current array on the row (for PATCH); pass [] for POST.
export function normaliseRoleOpportunities(
  raw: unknown,
  existing: RoleOpportunity[] = [],
): ValidationResult {
  if (raw === undefined) return { ok: true, value: existing };
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'role_opportunities must be an array' };
  }

  const existingIds = new Set(existing.map(e => e.id));
  const out: RoleOpportunity[] = [];
  const seenIds = new Set<string>();

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      return { ok: false, error: 'role_opportunities entries must be objects' };
    }
    const e = entry as Record<string, unknown>;
    const title = typeof e.title === 'string' ? e.title.trim() : '';
    if (!title) {
      return { ok: false, error: 'every role opportunity needs a title' };
    }

    const incomingId = typeof e.id === 'string' && e.id.length > 0 ? e.id : null;
    const id = incomingId && existingIds.has(incomingId)
      ? incomingId
      : (incomingId && /^[0-9a-f-]{36}$/i.test(incomingId) ? incomingId : randomUUID());

    if (seenIds.has(id)) {
      return { ok: false, error: 'duplicate role opportunity id' };
    }
    seenIds.add(id);

    const url = typeof e.url === 'string' ? e.url.trim() : '';
    if (url) {
      try {
        const u = new URL(url);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          return { ok: false, error: 'role url must be http(s)' };
        }
      } catch {
        return { ok: false, error: 'invalid role url' };
      }
    }

    out.push({
      id,
      title: title.slice(0, 200),
      description: typeof e.description === 'string' && e.description.trim()
        ? e.description.trim().slice(0, 2000) : null,
      location: typeof e.location === 'string' && e.location.trim()
        ? e.location.trim().slice(0, 200) : null,
      url: url || null,
    });
  }

  return { ok: true, value: out };
}

// Normalises a partner website URL: prepends https:// if no protocol given.
export function normaliseWebsite(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch { return null; }
}
