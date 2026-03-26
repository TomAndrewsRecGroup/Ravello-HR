import { createBrowserClient } from '@supabase/ssr';

// Database types will be generated via `npx supabase gen types typescript` once connected.
export function createClient() {
  return createBrowserClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL  ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key',
  );
}
