import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail, lastEmailError } from '@/lib/email';
import { notificationDigestEmail, type DigestItem } from '@/lib/email/templates/notification';
import { portalUrl } from '@/lib/portalUrl';
import { adminUrl } from '@/lib/adminUrl';
import { COUNT_EXACT, judgeWrite } from '@/lib/supabase/mutations';
import { defaultEmailMode, logEmail, readPreferences, type Recipient, STAFF_ROLE } from './notify';
import { isNotificationType, type NotificationType } from './types';

// The daily digest: for everyone on `daily` (staff by default), the
// unread notifications that have not been emailed, claimed as a set
// before the send and released if the send fails.

export interface DigestTally {
  users:          number;
  emailed:        number;
  email_failures: number;
  items:          number;
  errors:         string[];
}

const MAX_ITEMS = 50;
const LOOKBACK_DAYS = 7;

interface NotificationRow {
  id: string; type: string; title: string; body: string | null; link: string | null; created_at: string;
}

export async function digestCandidates(sb: SupabaseClient): Promise<Recipient[]> {
  // Staff default to daily; anyone else opts in through a preference row.
  const [{ data: staff, error: sErr }, { data: prefs, error: pErr }] = await Promise.all([
    sb.from('profiles').select('id, email, role').eq('role', STAFF_ROLE),
    sb.from('notification_preferences').select('user_id, email_mode').eq('email_mode', 'daily'),
  ]);
  if (sErr) throw new Error(`digest staff: ${sErr.message}`);
  if (pErr) throw new Error(`digest prefs: ${pErr.message}`);
  const ids = new Set<string>((prefs ?? []).map(p => (p as { user_id: string }).user_id));
  for (const s of (staff ?? []) as { id: string }[]) ids.add(s.id);
  if (ids.size === 0) return [];
  const { data: profiles, error } = await sb.from('profiles').select('id, email, role').in('id', [...ids]);
  if (error) throw new Error(`digest profiles: ${error.message}`);
  return ((profiles ?? []) as { id: string; email: string | null; role: string }[])
    .map(p => ({ id: p.id, email: p.email, role: p.role, app: p.role === STAFF_ROLE ? 'admin' as const : 'portal' as const }));
}

export async function runDigest(sb: SupabaseClient, opts: { now?: Date } = {}): Promise<DigestTally> {
  const tally: DigestTally = { users: 0, emailed: 0, email_failures: 0, items: 0, errors: [] };
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString();

  let recipients: Recipient[];
  try { recipients = await digestCandidates(sb); } catch (err) { tally.errors.push((err as Error).message); return tally; }
  const prefs = await readPreferences(sb, recipients.map(r => r.id));

  for (const r of recipients) {
    if (!r.email) continue;
    const pref = prefs.get(r.id);
    const mode = pref?.email_mode ?? defaultEmailMode(r.role);
    if (mode !== 'daily') continue;
    tally.users++;

    const { data, error } = await sb.from('notifications')
      .select('id, type, title, body, link, created_at')
      .eq('user_id', r.id).eq('read', false).is('emailed_at', null).gte('created_at', since)
      .order('created_at', { ascending: false }).limit(MAX_ITEMS);
    if (error) { tally.errors.push(`${r.id}: ${error.message}`); continue; }
    const muted = new Set(pref?.muted_types ?? []);
    const rows = ((data ?? []) as NotificationRow[]).filter(n => !muted.has(n.type));
    if (rows.length === 0) continue;

    const ids = rows.map(n => n.id);
    const claim = await sb.from('notifications').update({ emailed_at: now.toISOString() }, COUNT_EXACT)
      .in('id', ids).is('emailed_at', null);
    const outcome = judgeWrite({ error: claim.error, count: claim.count }, 'digest claim');
    if (!outcome.ok) { if (claim.error) tally.errors.push(`${r.id}: ${claim.error.message}`); continue; }

    const base = r.app === 'admin' ? adminUrl() : portalUrl();
    const items: DigestItem[] = rows.map(n => ({
      type:  (isNotificationType(n.type) ? n.type : 'general') as NotificationType,
      title: n.title, body: n.body, at: n.created_at,
      href:  n.link ? `${base}${n.link}` : null,
    }));
    const message = notificationDigestEmail({
      items, appHref: base,
      dateLabel: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
    });
    const result = await sendEmail({ to: r.email, subject: message.subject, html: message.html, tag: message.tag });
    const errorMessage = result?.delivered ? null : (lastEmailError()?.message ?? 'Email send failed.');
    if (errorMessage) {
      tally.email_failures++;
      await sb.from('notifications').update({ emailed_at: null }, COUNT_EXACT).in('id', ids);
    } else {
      tally.emailed++;
      tally.items += rows.length;
    }
    await logEmail(sb, { recipient: r, companyId: null, subject: message.subject, html: message.html, providerId: result?.delivered ? result.id : null, errorMessage });
  }
  return tally;
}
