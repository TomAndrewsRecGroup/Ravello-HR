import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | The People System',
  description: 'How The People System collects, uses, and protects your personal data under UK GDPR.',
};

export default function PrivacyPage() {
  return (
    <div className="pt-28 pb-20 px-4 sm:px-6 lg:px-8">
      <article className="max-w-3xl mx-auto prose prose-sm" style={{ color: 'var(--ink)' }}>
        <h1 style={{ fontFamily: 'var(--font-cormorant), serif', fontWeight: 300, fontSize: 'clamp(2rem,4vw,3rem)', letterSpacing: '-0.02em' }}>
          Privacy Policy
        </h1>
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Last updated: April 2026</p>

        <h2>1. Who we are</h2>
        <p>
          The People System (trading as The People Office Ltd) is an HR consultancy registered in England &amp; Wales.
          We are the data controller for the personal data we collect through this website and our client portals.
        </p>

        <h2>2. What data we collect</h2>
        <ul>
          <li><strong>Contact information</strong> &mdash; name, email address, company name (provided when you use our tools, book a call, or sign up)</li>
          <li><strong>Assessment data</strong> &mdash; answers you provide to our HR diagnostic tools (Hiring Score, HR Risk Score, etc.)</li>
          <li><strong>Usage data</strong> &mdash; pages visited, time on site, browser type (collected via Google Analytics and Microsoft Clarity)</li>
          <li><strong>Portal data</strong> &mdash; HR records, documents, and communications stored by client companies in our portal</li>
        </ul>

        <h2>3. How we use your data</h2>
        <ul>
          <li>To provide and improve our HR consultancy services</li>
          <li>To send you your assessment results and relevant follow-up information</li>
          <li>To respond to enquiries and support requests</li>
          <li>To analyse website usage and improve our tools</li>
        </ul>

        <h2>4. Legal basis for processing</h2>
        <p>
          We process your data based on: (a) your consent when you submit a form or use a tool,
          (b) legitimate interest for business communications and service improvement,
          (c) contractual necessity when you are a client using our portal.
        </p>

        <h2>5. Data sharing</h2>
        <p>
          We do not sell your personal data. We may share data with: Supabase (database hosting),
          Vercel (website hosting), Resend (email delivery), Stripe (payment processing),
          and Google/Microsoft (analytics). All processors comply with UK GDPR.
        </p>

        <h2>6. Data retention</h2>
        <p>
          Lead data is retained for 24 months. Client portal data is retained for the duration
          of the service agreement plus 6 years. You can request deletion at any time.
        </p>

        <h2>7. Your rights</h2>
        <p>
          Under UK GDPR you have the right to: access your data, rectify inaccuracies,
          erase your data, restrict processing, data portability, and object to processing.
          Contact us at <a href="mailto:privacy@thepeoplesystem.co.uk">privacy@thepeoplesystem.co.uk</a>.
        </p>

        <h2>8. Cookies</h2>
        <p>
          We use essential cookies for authentication and session management. Analytics cookies
          (Google Analytics, Microsoft Clarity) are used to understand how visitors use our site.
          You can disable these in your browser settings.
        </p>

        <h2>9. Contact</h2>
        <p>
          For privacy enquiries: <a href="mailto:privacy@thepeoplesystem.co.uk">privacy@thepeoplesystem.co.uk</a>
        </p>
      </article>
    </div>
  );
}
