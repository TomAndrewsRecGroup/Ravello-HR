import { notFound } from 'next/navigation';
import { getServiceClient, findReferralCompany } from '@/lib/referral';
import AthleteReferralForm from './AthleteReferralForm';

export const dynamic = 'force-dynamic';

export default async function AthleteReferralPage({ params }: { params: { slug: string } }) {
  const supabase = getServiceClient();
  const company = supabase ? await findReferralCompany(supabase, params.slug) : null;
  if (!company) notFound();

  return (
    <section className="px-6 md:px-12 pb-16 pt-4">
      <div className="mx-auto" style={{ maxWidth: 760 }}>
        <div className="mb-8" style={{ maxWidth: 640 }}>
          <p className="a2i-section-label">Athletes To Industry</p>
          <h1 className="a2i-display mt-3" style={{ fontSize: 'clamp(30px,5vw,52px)' }}>
            Join the <span className="a2i-gold">programme</span>.
          </h1>
          <span className="a2i-gold-line mt-5" />
          <p className="a2i-prose mt-5" style={{ fontSize: 16 }}>
            {company.name} has invited you to register with Athletes To Industry — the structured
            transition from elite sport into industry. Tell us about yourself and add your CV, and the
            team at Andrews Recruitment Group will be in touch to map out your next chapter.
          </p>
        </div>

        <div className="a2i-panel" style={{ padding: 'clamp(24px, 4vw, 40px)' }}>
          <AthleteReferralForm slug={company.slug} />
        </div>
      </div>
    </section>
  );
}
