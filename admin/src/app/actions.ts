'use server';

import { revalidatePath, revalidateTag } from 'next/cache';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function revalidateAdminPath(path: string) {
  revalidatePath(path);

  // If the revalidated path is a client-scoped route, also flush the
  // unstable_cache entry for that client's detail so the next render
  // reads fresh data instead of the 60s cache. This keeps every
  // existing caller working without touching 19 files.
  const match = path.match(/\/clients\/([^/]+)/);
  if (match && UUID_RE.test(match[1])) {
    revalidateTag(`client:${match[1]}`);
  }
}

// Explicit helper for places that want to flush a client's detail cache
// without touching any specific path (e.g. after an API-route mutation).
export async function revalidateClientDetail(id: string) {
  revalidateTag(`client:${id}`);
  revalidatePath(`/clients/${id}`);
}
