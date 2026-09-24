import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// The service-role client, for the few server routes that must write a
// column a signed-in client may not write themselves (088's allow-list
// guard on companies/profiles). The ROUTE decides who may do what —
// session check, company from the session, never from the body — and
// this client only carries the write. Never import it into a client
// component: the key would ship to the browser.

export function createServiceSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service-role config missing');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
