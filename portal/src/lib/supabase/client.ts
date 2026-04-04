import { createBrowserClient } from '@supabase/ssr';

// Database types defined in ./database.types.ts for reference.
// Using any generic until full types are generated from live DB via:
//   npx supabase gen types typescript --project-id <id>
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL  ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key',
  );
}
