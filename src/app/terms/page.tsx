import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | The People System',
  description: 'Terms and conditions for using The People System website and services.',
};

export default function TermsPage() {
  return (
    <div className="pt-28 pb-20 px-4 sm:px-6 lg:px-8">
      <article className="max-w-3xl mx-auto prose prose-sm" style={{ color: 'var(--ink)' }}>
        <h1 style={{ fontFamily: 'var(--font-cormorant), serif', fontWeight: 300, fontSize: 'clamp(2rem,4vw,3rem)', letterSpacing: '-0.02em' }}>
          Terms of Service
        </h1>
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Last updated: April 2026</p>

        <h2>1. About these terms</h2>
        <p>
          These terms govern your use of thepeoplesystem.co.uk (the &ldquo;Website&rdquo;) and any
          services provided by The People System (trading as The People Office Ltd),
          registered in England &amp; Wales (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;).
        </p>

        <h2>2. Use of our website</h2>
        <ul>
          <li>The Website is provided for information and access to our HR consultancy tools</li>
          <li>You must be at least 18 years old to use our services</li>
          <li>You agree not to misuse the Website or attempt to access it through unauthorised means</li>
        </ul>

        <h2>3. Free tools and assessments</h2>
        <p>
          Our diagnostic tools (Hiring Score, HR Risk Score, Policy Healthcheck, Due Diligence Checklist)
          are provided free of charge for informational purposes. Results are indicative and do not
          constitute professional HR or legal advice. For tailored guidance,
          <a href="/book"> book a consultation</a>.
        </p>

        <h2>4. Client portal</h2>
        <p>
          Access to the client portal is governed by your service agreement with The People System.
          You are responsible for maintaining the confidentiality of your login credentials and for
          all activity under your account.
        </p>

        <h2>5. Intellectual property</h2>
        <p>
          All content, tools, and methodologies on this Website are the intellectual property of
          The People System unless otherwise stated. You may not reproduce, distribute, or create
          derivative works without our written permission.
        </p>

        <h2>6. Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, The People System shall not be liable for any
          indirect, incidental, or consequential damages arising from your use of the Website
          or our services. Our total liability shall not exceed the fees paid by you in the
          12 months preceding the claim.
        </p>

        <h2>7. Third-party services</h2>
        <p>
          Our Website may contain links to third-party services (Stripe for payments, Google Calendar
          for bookings). We are not responsible for the content or practices of these services.
        </p>

        <h2>8. Changes to these terms</h2>
        <p>
          We may update these terms from time to time. Material changes will be communicated via
          email to active clients. Continued use of the Website constitutes acceptance of updated terms.
        </p>

        <h2>9. Governing law</h2>
        <p>
          These terms are governed by the laws of England and Wales. Any disputes shall be subject
          to the exclusive jurisdiction of the courts of England and Wales.
        </p>

        <h2>10. Contact</h2>
        <p>
          For questions about these terms: <a href="mailto:info@thepeoplesystem.co.uk">info@thepeoplesystem.co.uk</a>
        </p>
      </article>
    </div>
  );
}
