import { createBrowserClient } from '@supabase/ssr';

function getCookieDomain(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const host = window.location.hostname;
  // Set cookie on parent domain so it works across www. and non-www
  // e.g. host "www.admin.thepeoplesystem.co.uk" → domain ".admin.thepeoplesystem.co.uk"
  if (host.startsWith('www.')) {
    return '.' + host.replace(/^www\./, '');
  }
  return undefined; // default browser behavior
}

export function createClient() {
  const domain = getCookieDomain();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder',
    domain
      ? { cookieOptions: { domain, path: '/', sameSite: 'lax' as const, secure: true } }
      : undefined,
  );
}
