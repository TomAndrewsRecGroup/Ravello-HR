'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { redisDel } from '@/lib/cache/redis';
import { clientDetailRedisKey } from '@/lib/cache/clientDetail';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function revalidateAdminPath(path: string) {
  revalidatePath(path);

  // If the revalidated path is a client-scoped route, also flush both
  // cache layers for that client's detail so the next render reads
  // fresh data. Keeps every existing caller working without edits.
  const match = path.match(/\/clients\/([^/]+)/);
  if (match && UUID_RE.test(match[1])) {
    const id = match[1];
    revalidateTag(`client:${id}`);
    // Fire-and-forget — Redis failure must not break a write path.
    redisDel(clientDetailRedisKey(id)).catch(() => {});
  }
}

// Explicit helper for places that want to flush a client's detail
// cache without a path (e.g. after an API-route mutation).
export async function revalidateClientDetail(id: string) {
  revalidateTag(`client:${id}`);
  revalidatePath(`/clients/${id}`);
  redisDel(clientDetailRedisKey(id)).catch(() => {});
}
