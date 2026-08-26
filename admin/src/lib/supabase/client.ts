import { createBrowserClient } from '@supabase/ssr';
import { instrumentSupabase } from './instrument';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set',
    );
  }

  // Instrumented so a failed query is reported rather than rendering
  // as an empty page. See instrument.ts — behaviour is otherwise identical.
  return instrumentSupabase(createBrowserClient(url, key), 'browser');
}
