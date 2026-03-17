import type { Metadata } from 'next';
export const dynamic = 'force-dynamic';
import Link from 'next/link';
import RevealScript from '@/components/RevealScript';

export const metadata: Metadata = {
  title: 'Privacy Policy | Ravello HR',
  description: 'How Ravello HR collects, uses, and protects your personal data.',
  robots: { index: false, follow: false },
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <RevealScript />
      <section style={{ background: 'var(--color-void)', paddingTop: '8rem', paddingBottom: '6rem' }}>
        <div style={{ maxWidth: 'var(--container-narrow)', margin: '0 auto', padding: '0 2rem' }}>

          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" style={{ marginBottom: '2.5rem' }}>
            <ol style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', listStyle: 'none', padding: 0, margin: 0 }}>
              <li>
                <Link href="/" style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-muted)', textDecoration: 'none' }}>
                  Home
                </Link>
              </li>
              <li style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-small)' }}>›</li>
              <li style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>Privacy Policy</li>
            </ol>
          </nav>

          <div data-reveal>
            <p style={{
              fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)',
              letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase',
              color: 'var(--color-purple-light)', marginBottom: '1rem',
            }}>
              Legal
            </p>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-black)',
              fontSize: 'var(--text-display)', letterSpacing: 'var(--tracking-tight)',
              lineHeight: 'var(--leading-tight)', color: 'var(--color-text-primary)',
              marginBottom: '1.5rem',
            }}>
              Privacy Policy
            </h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-small)', marginBottom: '3rem' }}>
              Last updated: March 2026
            </p>
          </div>

          <div data-reveal style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            {[
              {
                heading: 'Who we are',
                body: 'Ravello HR is an HR strategy and project delivery consultancy operating across the UK. This privacy policy explains how we collect, use, and protect personal information when you use our website at ravellohr.co.uk or engage with our diagnostic tools and services.',
              },
              {
                heading: 'Information we collect',
                body: 'We collect information you provide directly to us, including your name, email address, and company name when you use our diagnostic tools (Smart Hiring System™, PolicySafe™, DealReady People™), download templates, or submit an enquiry through our contact form. We also collect usage data through analytics tools to understand how visitors interact with our site.',
              },
              {
                heading: 'How we use your information',
                body: 'We use the information you provide to deliver your diagnostic results, send you the reports and templates you have requested, follow up on scoping call requests, and improve our products and services. We do not sell your personal data to third parties. We may share data with trusted service providers (such as email delivery and CRM platforms) solely to operate our services.',
              },
              {
                heading: 'Legal basis for processing',
                body: 'We process your data on the basis of your consent (where you have submitted a form or gated tool) and our legitimate interests in operating and improving our business. You can withdraw consent at any time by contacting us at the address below.',
              },
              {
                heading: 'Data retention',
                body: 'We retain your personal data for as long as necessary to fulfil the purposes for which it was collected, or as required by law. Enquiry and diagnostic data is typically retained for 24 months unless you request earlier deletion.',
              },
              {
                heading: 'Your rights',
                body: 'Under UK GDPR you have the right to access, correct, or delete your personal data; to object to or restrict processing; and to data portability. To exercise any of these rights, contact us at hello@ravellohr.co.uk. You also have the right to lodge a complaint with the Information Commissioner\'s Office (ICO) at ico.org.uk.',
              },
              {
                heading: 'Cookies',
                body: 'We use essential cookies to operate the site and analytics cookies (such as Google Analytics 4) to understand usage patterns. Analytics cookies are only placed with your consent. You can manage cookie preferences through your browser settings.',
              },
              {
                heading: 'Contact',
                body: 'For any questions about this policy or your personal data, contact us at hello@ravellohr.co.uk.',
              },
            ].map(({ heading, body }) => (
              <div key={heading}>
                <h2 style={{
                  fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-bold)',
                  fontSize: 'var(--text-h3)', color: 'var(--color-text-primary)',
                  marginBottom: '0.75rem',
                }}>
                  {heading}
                </h2>
                <p style={{
                  color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)',
                  fontSize: 'var(--text-body)',
                }}>
                  {body}
                </p>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '4rem', paddingTop: '2rem', borderTop: '1px solid var(--color-border)' }}>
            <Link href="/" style={{
              color: 'var(--color-purple-light)', fontSize: 'var(--text-small)',
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            }}>
              ← Back to home
            </Link>
          </div>

        </div>
      </section>
    </>
  );
}
