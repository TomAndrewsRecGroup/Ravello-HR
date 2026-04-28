// Build a /clients/<...> URL preferring the readable slug.
//
// New companies always have a slug (set by the create-client route
// from the company name); legacy rows without one fall back to the
// uuid. The /clients/[id] page handler accepts either form and
// redirects uuid → slug for the canonical URL, so the fallback
// still ends up at the readable address.
//
// Use this everywhere a Link href targets a client profile so the
// admin never sees a uuid in the address bar on a normal click.

export function clientHref(c: { id: string; slug?: string | null }): string {
  return `/clients/${c.slug ?? c.id}`;
}
