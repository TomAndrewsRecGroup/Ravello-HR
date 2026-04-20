'use server';

import { revalidatePath, revalidateTag } from 'next/cache';

export async function revalidateAdminPath(path: string) {
  revalidatePath(path);
}

// Invalidate the unstable_cache entry for a specific client's detail page.
// Call after any mutation that affects /clients/[id] data (user invites,
// role creation, ticket updates, document uploads, company edits, etc.).
export async function revalidateClientDetail(id: string) {
  revalidateTag(`client:${id}`);
  revalidatePath(`/clients/${id}`);
}
