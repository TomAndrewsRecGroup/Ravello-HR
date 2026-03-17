import type { Metadata } from 'next';
export const dynamic = 'force-dynamic';
import Link from 'next/link';
import RevealScript from '@/components/RevealScript';

export const metadata: Metadata = {
  title: 'Terms of Use | Ravello HR',
  description: 'Terms governing the use of the Ravello HR website and diagnostic tools.',
  robots: { index: false, follow: false },
};

export default function TermsPage() {
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
              <li style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>Terms of Use</li>
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
              Terms of Use
            </h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-small)', marginBottom: '3rem' }}>
              Last updated: March 2026
            </p>
          </div>

          <div data-reveal style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            {[
              {
                heading: 'Acceptance of terms',
                body: 'By accessing or using the Ravello HR website at ravellohr.co.uk, you agree to be bound by these terms of use. If you do not agree to these terms, please do not use this site.',
              },
              {
                heading: 'Use of the site',
                body: 'This site and its diagnostic tools are provided for informational and lead generation purposes. The outputs of our diagnostic tools (including the Smart Hiring System™ score, PolicySafe™ gap report, and DealReady People™ risk assessment) are indicative assessments only and do not constitute professional legal, HR, or employment law advice. You should seek qualified professional advice before acting on any output.',
              },
              {
                heading: 'Intellectual property',
                body: 'All content on this site, including but not limited to text, graphics, tool outputs, product names (Smart Hiring System™, PolicySafe™, DealReady People™), and design elements, is the intellectual property of Ravello HR. You may not reproduce, distribute, or create derivative works from any content on this site without express written permission.',
              },
              {
                heading: 'Diagnostic tools',
                body: 'Our diagnostic tools are provided free of charge and without warranty. The outputs are generated based on the information you provide. Ravello HR makes no representations about the accuracy or completeness of any diagnostic output and accepts no liability for decisions made in reliance on them.',
              },
              {
                heading: 'Limitation of liability',
                body: 'To the fullest extent permitted by law, Ravello HR accepts no liability for any direct, indirect, incidental, or consequential loss or damage arising from your use of this site or its tools. This includes but is not limited to loss of profit, loss of data, or business interruption.',
              },
              {
                heading: 'Third-party links',
                body: 'This site may contain links to third-party websites. These are provided for convenience only. Ravello HR does not endorse or accept responsibility for the content or practices of any third-party site.',
              },
              {
                heading: 'Governing law',
                body: 'These terms are governed by the laws of England and Wales. Any disputes arising from your use of this site will be subject to the exclusive jurisdiction of the courts of England and Wales.',
              },
              {
                heading: 'Changes to these terms',
                body: 'We may update these terms from time to time. The date of the most recent revision appears at the top of this page. Continued use of the site after any change constitutes your acceptance of the revised terms.',
              },
              {
                heading: 'Contact',
                body: 'For questions about these terms, contact us at hello@ravellohr.co.uk.',
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
