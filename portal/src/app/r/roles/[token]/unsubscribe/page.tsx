import type { Metadata } from 'next';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { peekRoleAlertToken } from '@/lib/a2iRoles/token';
import { isUnsubscribed } from '@/lib/a2iRoles/match';
import UnsubscribeClient from './UnsubscribeClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Unsubscribe | Athletes To Industry', robots: { index: false, follow: false } };

// Opening this page changes nothing; the button does. Works on an
// expired link — stopping the emails must always be possible.

export default async function UnsubscribePage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const sb = createServiceSupabaseClient();
  const t = await peekRoleAlertToken(sb, token);
  const already = t ? await isUnsubscribed(sb, t.emailLower) : false;

  return (
    <section className="px-6 md:px-12 pb-16 pt-4">
      <div className="mx-auto a2i-panel" style={{ maxWidth: 640, padding: 'clamp(24px, 4vw, 40px)' }}>
        <p className="a2i-section-label">Weekly roles email</p>
        {!t ? (
          <>
            <h1 className="a2i-display mt-3" style={{ fontSize: 28 }}>This link isn&rsquo;t working.</h1>
            <p className="a2i-prose mt-4" style={{ fontSize: 15 }}>
              Reply to any of the weekly emails and Tom will take you off the list.
            </p>
          </>
        ) : (
          <UnsubscribeClient token={token} alreadyUnsubscribed={already} />
        )}
      </div>
    </section>
  );
}
