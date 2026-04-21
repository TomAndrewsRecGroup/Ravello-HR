'use server';

// Static imports here must stay free of Node-only packages (e.g. `redis`).
// Next.js' flight-action-entry-loader walks the static dependency graph
// when generating client-side proxies for these server actions, and any
// Node-only transitive dep causes "Can't resolve net/tls/crypto/..."
// build failures. We reach Redis via dynamic import() at call time.

import { revalidatePath, revalidateTag } from 'next/cache';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clientDetailRedisKey(id: string): string {
  return `client-detail:${id}`;
}

// Lazy, best-effort Redis eviction. Failure must never break a write path.
async function tryRedisDel(key: string): Promise<void> {
  try {
    const mod = await import('@/lib/cache/redis');
    await mod.redisDel(key);
  } catch {
    // Redis not configured or unreachable — rely on unstable_cache tag
    // invalidation below to keep the app correct.
  }
}

export async function revalidateAdminPath(path: string) {
  revalidatePath(path);

  // If the revalidated path is a client-scoped route, also flush both
  // cache layers for that client's detail so the next render reads
  // fresh data. Keeps every existing caller working without edits.
  const match = path.match(/\/clients\/([^/]+)/);
  if (match && UUID_RE.test(match[1])) {
    const id = match[1];
    revalidateTag(`client:${id}`);
    tryRedisDel(clientDetailRedisKey(id));
  }
}

// Explicit helper for places that want to flush a client's detail
// cache without a path (e.g. after an API-route mutation).
export async function revalidateClientDetail(id: string) {
  revalidateTag(`client:${id}`);
  revalidatePath(`/clients/${id}`);
  tryRedisDel(clientDetailRedisKey(id));
}
