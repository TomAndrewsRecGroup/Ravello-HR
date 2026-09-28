// Display helpers for the PROTECT safety screens. No server imports:
// safe in client components. (safetyContext.ts re-exports these for
// server pages.)

export interface DirectoryPerson { user_id: string; full_name: string; via_grant: boolean }

/** Name for a user id from the directory, for display only. */
export function nameOf(dir: DirectoryPerson[], id: string | null | undefined): string {
  if (!id) return '—';
  return dir.find(p => p.user_id === id)?.full_name ?? 'Someone outside this organisation';
}

/** A search param as a single trimmed string, or ''. */
export function param(sp: Record<string, string | string[] | undefined>, key: string): string {
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v ?? '').trim();
}

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }) : '—';
export const fmtDateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : '—';
export const todayIso = () => new Date().toISOString().slice(0, 10);
