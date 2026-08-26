'use client';

// Catches errors thrown by the root layout itself — the one case
// error.tsx cannot reach, because error.tsx renders *inside* the layout
// that just failed. It must therefore ship its own <html>/<body>.

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);

  return (
    <html lang="en">
      <body style={{
        margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center',
        background: '#EFF0F7', color: '#070B1D',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}>
        <main style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: '#38436A', margin: '0 0 20px', lineHeight: 1.6 }}>
            This page could not load. The fault has been reported to our team.
          </p>
          <button
            onClick={reset}
            style={{
              padding: '10px 20px', borderRadius: 10, border: 0, cursor: 'pointer',
              background: '#7C3AED', color: '#fff', fontSize: 14, fontWeight: 600,
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ fontSize: 11, color: '#748099', marginTop: 20 }}>Reference: {error.digest}</p>
          )}
        </main>
      </body>
    </html>
  );
}
