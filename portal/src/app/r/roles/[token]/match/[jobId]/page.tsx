import type { Metadata } from 'next';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { loadMatchContext, publicMatchView } from '@/lib/a2iRoles/match';
import MatchClient from './MatchClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Match me | Athletes To Industry', robots: { index: false, follow: false } };

// Opened from the "Match me" button in the Thursday roles email. Showing
// this page records nothing — the athlete confirms with one more tap
// (MatchClient), because email link scanners open every link first.

export default async function MatchPage(props: { params: Promise<{ token: string; jobId: string }> }) {
  const { token, jobId } = await props.params;
  const ctx = await loadMatchContext(createServiceSupabaseClient(), token, jobId);

  if (!ctx.ok) {
    return (
      <section className="px-6 md:px-12 pb-16 pt-4">
        <div className="mx-auto a2i-panel" style={{ maxWidth: 640, padding: 'clamp(24px, 4vw, 40px)' }}>
          <p className="a2i-section-label">Match me</p>
          <h1 className="a2i-display mt-3" style={{ fontSize: 28 }}>This link isn&rsquo;t working.</h1>
          <p className="a2i-prose mt-4" style={{ fontSize: 15 }}>{ctx.error}</p>
        </div>
      </section>
    );
  }

  const view = publicMatchView(ctx);
  const meta = [view.role.location, view.role.contract, view.role.salary].filter(Boolean).join(' · ');

  return (
    <section className="px-6 md:px-12 pb-16 pt-4">
      <div className="mx-auto" style={{ maxWidth: 680 }}>
        <div className="mb-6">
          <p className="a2i-section-label">Match me</p>
          <h1 className="a2i-display mt-3" style={{ fontSize: 'clamp(28px,5vw,44px)' }}>
            {view.firstName ? <>{view.firstName}, interested in this role?</> : <>Interested in this role?</>}
          </h1>
          <span className="a2i-gold-line mt-5" />
        </div>

        <div className="a2i-panel" style={{ padding: 'clamp(24px, 4vw, 40px)' }}>
          {view.role.industry && <p className="a2i-label">{view.role.industry}</p>}
          <h2 className="a2i-display mt-2" style={{ fontSize: 26 }}>{view.role.title}</h2>
          {meta && <p className="a2i-prose mt-2" style={{ fontSize: 14, opacity: 0.85 }}>{meta}</p>}
          {view.role.summary && <p className="a2i-prose mt-4" style={{ fontSize: 15 }}>{view.role.summary}</p>}
          <p className="mt-4" style={{ fontSize: 14 }}>
            <a href={view.roleUrl} target="_blank" rel="noopener noreferrer">Read the full role on andrews-recruitment.com →</a>
          </p>

          <div className="mt-8">
            <MatchClient token={token} jobId={view.role.id} alreadyMatched={view.alreadyMatched} />
          </div>
        </div>
      </div>
    </section>
  );
}
