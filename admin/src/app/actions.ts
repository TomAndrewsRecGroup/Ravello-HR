'use server';

import { revalidatePath } from 'next/cache';

export async function revalidateAdminPath(path: string) {
  revalidatePath(path);
}
