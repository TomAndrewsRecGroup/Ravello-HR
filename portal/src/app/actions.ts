'use server';

import { revalidatePath } from 'next/cache';

export async function revalidatePortalPath(path: string) {
  revalidatePath(path);
}
