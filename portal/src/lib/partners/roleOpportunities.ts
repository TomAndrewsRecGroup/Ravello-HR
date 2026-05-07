// Type re-exported from admin/src/lib/partners/roleOpportunities.ts.
// The admin app owns JSONB validation/normalisation server-side; the portal
// only needs the shape for read-side rendering, so we mirror the interface
// here (kept in sync manually — this is a multi-Vercel-project monorepo
// without a shared workspace package).

export interface RoleOpportunity {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
}
