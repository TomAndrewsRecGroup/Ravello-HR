'use server';

// Pure Next.js cache helpers. Intentionally free of any Node-only
// transitive deps so the flight-action-entry-loader can generate
// client-side action proxies without webpack choking on net/tls/crypto.
//
// The unstable_cache layer in lib/cache/clientDetail.ts is tag-based;
// we call revalidateTag here to flush it after any write that affects
// the /clients/[id] page.

import { revalidatePath, revalidateTag } from 'next/cache';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function revalidateAdminPath(path: string) {
  revalidatePath(path);

  // Client-scoped paths also flush the per-client unstable_cache tag so
  // the next render reads fresh data instead of the 60s cached entry.
  const match = path.match(/\/clients\/([^/]+)/);
  if (match && UUID_RE.test(match[1])) {
    revalidateTag(`client:${match[1]}`);
  }
}

export async function revalidateClientDetail(id: string) {
  revalidateTag(`client:${id}`);
  revalidatePath(`/clients/${id}`);
}
