'use client';

import { useMemo, useState } from 'react';
import { Share2 } from 'lucide-react';
import CopyLinkRow from '@/components/modules/CopyLinkRow';

interface CompanyOpt { id: string; name: string; slug: string | null }

export default function ReferralLinksAdmin({
  companies,
  portalBase,
}: {
  companies: CompanyOpt[];
  portalBase: string;
}) {
  const withSlug = useMemo(() => companies.filter(c => c.slug), [companies]);
  const [selected, setSelected] = useState<string>(withSlug[0]?.id ?? '');

  const company = withSlug.find(c => c.id === selected);
  const slug = company?.slug ?? '';
  const athleteUrl = slug ? `${portalBase}/r/athlete/${slug}` : '';
  const partnerUrl = slug ? `${portalBase}/r/partner/${slug}` : '';

  return (
    <section className="card p-5">
      <div className="flex items-start gap-2 mb-4">
        <Share2 size={16} style={{ color: 'var(--purple)' }} className="mt-0.5" />
        <div>
          <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Client referral links</h2>
          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
            Open links a client can share with any athlete or partner. Athlete submissions land on the
            client&rsquo;s roster; partner submissions email the The People System team. Pick a client to grab their links.
          </p>
        </div>
      </div>

      {withSlug.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          No active clients with a slug are available yet.
        </p>
      ) : (
        <div className="space-y-4">
          <div style={{ maxWidth: 360 }}>
            <label className="label">Client</label>
            <select className="input" value={selected} onChange={e => setSelected(e.target.value)}>
              {withSlug.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          {slug && (
            <div className="grid md:grid-cols-2 gap-4">
              <CopyLinkRow label="Athlete sign-up link" url={athleteUrl} hint="For athletes" />
              <CopyLinkRow label="Partner enquiry link" url={partnerUrl} hint="For partners" />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
