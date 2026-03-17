import Link from 'next/link';
import Image from 'next/image';

const LOGO_URL = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/d853d50b-40d4-47f4-ac80-7058a2387dac.png';

export default function Footer() {
  return (
    <footer style={{
      background: 'var(--color-deep)',
      borderTop: '1px solid var(--color-border)',
    }}>
      <div style={{
        maxWidth: '1280px', margin: '0 auto',
        padding: '5rem 2rem 3rem',
      }}>
        {/* Main grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '3rem',
          marginBottom: '4rem',
        }}>
          {/* Column 1 — Products */}
          <div>
            <p style={{
              fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)',
              letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase',
              color: 'var(--color-purple-light)', marginBottom: '1.25rem',
            }}>
              Products
            </p>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                ['Smart Hiring System™', '/smart-hiring-system'],
                ['PolicySafe™',          '/policysafe'],
                ['DealReady People™',    '/dealready-people'],
              ].map(([label, href]) => (
                <Link key={href} href={href} style={{
                  color: 'var(--color-text-secondary)', textDecoration: 'none',
                  fontSize: 'var(--text-small)', transition: 'color 0.2s ease',
                }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Column 2 — Company */}
          <div>
            <p style={{
              fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)',
              letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase',
              color: 'var(--color-purple-light)', marginBottom: '1.25rem',
            }}>
              Company
            </p>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                ['About',    '/about'],
                ['Services', '/services'],
                ['Partners', '/partners'],
                ['Contact',  '/contact'],
              ].map(([label, href]) => (
                <Link key={href} href={href} style={{
                  color: 'var(--color-text-secondary)', textDecoration: 'none',
                  fontSize: 'var(--text-small)', transition: 'color 0.2s ease',
                }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Column 3 — Legal */}
          <div>
            <p style={{
              fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)',
              letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase',
              color: 'var(--color-purple-light)', marginBottom: '1.25rem',
            }}>
              Legal
            </p>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                ['Privacy Policy', '/privacy-policy'],
                ['Terms',          '/terms'],
              ].map(([label, href]) => (
                <Link key={href} href={href} style={{
                  color: 'var(--color-text-secondary)', textDecoration: 'none',
                  fontSize: 'var(--text-small)', transition: 'color 0.2s ease',
                }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Column 4 — Brand */}
          <div>
            <Image
              src={LOGO_URL}
              alt="Ravello HR"
              width={120}
              height={34}
              style={{ objectFit: 'contain', height: '30px', width: 'auto', marginBottom: '1rem' }}
            />
            <p style={{
              fontSize: 'var(--text-small)',
              color: 'var(--color-text-muted)',
              lineHeight: 'var(--leading-relaxed)',
              marginBottom: '1.25rem',
            }}>
              HR strategy, diagnostics,<br />and project delivery for growing UK businesses.
            </p>
            {/* Social links */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <a
                href="https://linkedin.com/company/ravellohr"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Ravello HR on LinkedIn"
                style={{
                  width: 34, height: 34,
                  borderRadius: 6,
                  border: '1px solid var(--color-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--color-text-muted)',
                  transition: 'border-color 0.2s ease, color 0.2s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(123,47,190,0.5)';
                  e.currentTarget.style.color = 'var(--color-purple-light)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.color = 'var(--color-text-muted)';
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{
          borderTop: '1px solid var(--color-border)',
          paddingTop: '2rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '1rem',
        }}>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            © {new Date().getFullYear()} Ravello HR. All rights reserved.
          </p>
          <a
            href="https://www.perplexity.ai/computer"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textDecoration: 'none' }}
          >
            Created with Perplexity Computer
          </a>
        </div>
      </div>
    </footer>
  );
}
