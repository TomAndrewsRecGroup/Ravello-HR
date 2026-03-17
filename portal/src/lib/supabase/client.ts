import { createBrowserClient } from '@supabase/ssr';

// Database types will be generated via `npx supabase gen types typescript` once connected.
// Remove the `any` cast and import Database from './types' at that point.
export function createClient() {
  return createBrowserClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
