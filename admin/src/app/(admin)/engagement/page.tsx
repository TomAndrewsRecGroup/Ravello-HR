import { redirect } from 'next/navigation';

// Go-live gap list, item 3 (2026-10-02): "keep only one" dashboard —
// Engagement's own content (logins, active roles, docs, notes, churn
// score) is now merged into the Client Health table on /health, which
// also keeps the IvyLens integration health and RLS audit panels this
// page never had. This route is kept only so an old bookmark or
// sidebar link still lands somewhere real.
export default function EngagementRedirect() {
  redirect('/health');
}
