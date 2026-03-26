import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Database types will be generated via `npx supabase gen types typescript` once connected.
export function createServerSupabaseClient() {
  const cookieStore = cookies();
  return createServerClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL  ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key',
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: Record<string, unknown>) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    },
  );
}
