'use client';
import { useEffect, useState, useCallback } from 'react';
import { Download, X } from 'lucide-react';

/**
 * Service Worker registration + PWA install prompt.
 *
 * Security:
 * - Only registers in production (no SW in dev to avoid caching issues)
 * - Checks navigator.serviceWorker exists before registering
 * - Install prompt is non-intrusive (dismissable banner)
 * - No data is stored — only captures the beforeinstallprompt event
 */
export default function ServiceWorkerRegistration() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Only register SW in production
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    // Check if already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
      return;
    }

    // Register service worker
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        // Check for updates every 60 minutes
        setInterval(() => registration.update(), 60 * 60 * 1000);
      })
      .catch((err) => {
        console.warn('SW registration failed:', err);
      });

    // Capture the install prompt
    const handler = (e: Event) => {
      e.preventDefault(); // Prevent Chrome's default mini-infobar
      setInstallPrompt(e);
      // Only show banner if user hasn't dismissed it before
      const dismissed = localStorage.getItem('pwa-install-dismissed');
      if (!dismissed) {
        setShowBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Detect successful installation
    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setShowBanner(false);
      setInstallPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstalled(true);
    }
    setShowBanner(false);
    setInstallPrompt(null);
  }, [installPrompt]);

  const handleDismiss = useCallback(() => {
    setShowBanner(false);
    localStorage.setItem('pwa-install-dismissed', 'true');
  }, []);

  // Don't render if already installed or no prompt available
  if (installed || !showBanner) return null;

  return (
    <div
      className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 sm:w-[340px] z-50 rounded-xl shadow-lg p-4 flex items-center gap-3"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        animation: 'slideUp 0.3s ease',
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(124,58,237,0.08)' }}
      >
        <Download size={18} style={{ color: 'var(--purple)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          Install The People System
        </p>
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          Add to your home screen for quick access
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={handleInstall}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
          style={{ background: 'var(--purple)' }}
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-alt)]"
          style={{ color: 'var(--ink-faint)' }}
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>

      <style jsx>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
