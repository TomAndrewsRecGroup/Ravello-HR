'use client';
import { createContext, useCallback, useContext, useState } from 'react';
import { Lock, X, Mail, ExternalLink } from 'lucide-react';

// Polite popup shown when a user clicks a feature their package
// doesn't include. Wraps the portal so any navigation item, CTA or
// in-page module can request it via useLockedFeature().

interface LockedFeatureContextValue {
  /** Open the modal with a specific feature label. */
  show: (featureLabel: string) => void;
}

const LockedFeatureContext = createContext<LockedFeatureContextValue>({ show: () => {} });

export function useLockedFeature() {
  return useContext(LockedFeatureContext);
}

interface ProviderProps {
  children:           React.ReactNode;
  accountManagerName: string | null;
  accountManagerEmail: string | null;
}

export function LockedFeatureProvider({ children, accountManagerName, accountManagerEmail }: ProviderProps) {
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  const show = useCallback((label: string) => setOpenLabel(label), []);
  const close = useCallback(() => setOpenLabel(null), []);

  return (
    <LockedFeatureContext.Provider value={{ show }}>
      {children}
      {openLabel && (
        <LockedFeatureModal
          featureLabel={openLabel}
          accountManagerName={accountManagerName}
          accountManagerEmail={accountManagerEmail}
          onClose={close}
        />
      )}
    </LockedFeatureContext.Provider>
  );
}

function LockedFeatureModal({
  featureLabel, accountManagerName, accountManagerEmail, onClose,
}: {
  featureLabel:       string;
  accountManagerName: string | null;
  accountManagerEmail: string | null;
  onClose:            () => void;
}) {
  const managerName = accountManagerName?.trim() || 'your account manager';
  const fallbackContactEmail = 'hello@thepeoplesystem.co.uk';
  const contactEmail = accountManagerEmail?.trim() || fallbackContactEmail;
  const subject = `Unlocking ${featureLabel} on our People System portal`;
  const mailto  = `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}`;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(7,11,29,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-[18px] w-full max-w-[420px] p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: '0 24px 64px rgba(7,11,29,0.25)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div
              className="w-9 h-9 rounded-[10px] flex items-center justify-center"
              style={{ background: 'rgba(124,58,237,0.10)', color: 'var(--purple)' }}
            >
              <Lock size={15} />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-faint)' }}>
              Not in your package
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-[var(--surface-alt)]"
            style={{ color: 'var(--ink-faint)', background: 'transparent', border: 'none' }}
          >
            <X size={14} />
          </button>
        </div>

        <h2 className="font-display font-semibold text-lg mb-2" style={{ color: 'var(--ink)' }}>
          <strong style={{ fontWeight: 700 }}>{featureLabel}</strong> is part of a different package
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
          Get in touch with {accountManagerName ? <strong>{accountManagerName}</strong> : managerName}, your account manager, to learn more about adding it to your portal.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <a href={mailto} className="btn-cta btn-sm inline-flex items-center gap-1.5">
            <Mail size={12} /> Email {accountManagerName ? accountManagerName.split(/\s+/)[0] : 'us'}
          </a>
          <button onClick={onClose} className="btn-ghost btn-sm">
            Maybe later
          </button>
        </div>

        {!accountManagerName && (
          <p className="text-[11px] mt-4" style={{ color: 'var(--ink-faint)' }}>
            No account manager assigned yet — your message goes to The People System team.
          </p>
        )}
      </div>
    </div>
  );
}
