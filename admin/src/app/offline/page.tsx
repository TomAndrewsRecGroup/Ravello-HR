import { WifiOff, RefreshCw } from 'lucide-react';

export const metadata = { title: 'Offline' };

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg)' }}>
      <div className="text-center max-w-sm">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ background: 'rgba(124,58,237,0.08)' }}
        >
          <WifiOff size={28} style={{ color: 'var(--purple)' }} />
        </div>
        <h1 className="text-xl font-semibold mb-2" style={{ color: 'var(--ink)' }}>
          You're offline
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--ink-faint)' }}>
          The People System needs an internet connection. Check your connection and try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white"
          style={{ background: 'var(--purple)' }}
        >
          <RefreshCw size={14} />
          Try again
        </button>
        <p className="text-xs mt-8" style={{ color: 'var(--ink-faint)' }}>
          The People System Admin
        </p>
      </div>
    </div>
  );
}
