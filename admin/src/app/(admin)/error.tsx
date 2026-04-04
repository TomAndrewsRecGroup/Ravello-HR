'use client';
import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Admin error:', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md px-6">
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(239,68,68,0.08)' }}>
          <AlertTriangle size={24} style={{ color: 'var(--danger)' }} />
        </div>
        <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--ink)' }}>Something went wrong</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--ink-faint)' }}>
          An error occurred while loading this page. This has been logged automatically.
        </p>
        <button onClick={reset} className="btn-cta btn-sm mx-auto">
          <RefreshCw size={13} /> Try Again
        </button>
        {error.digest && (
          <p className="text-[10px] mt-4" style={{ color: 'var(--ink-faint)' }}>Error ID: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
