'use client';

import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { Mail, Loader2 } from 'lucide-react';
import type { SendEmailTarget, SendEmailDefaults } from './SendEmailModal';

const SendEmailModal = dynamic(() => import('./SendEmailModal'), { ssr: false });

interface Props {
  target:    SendEmailTarget;
  /** Builder runs only when the button is clicked. Lets the caller
   *  do any async work (e.g. fetch the client's portal users) lazily
   *  rather than on every parent render. */
  buildDefaults?: () => Promise<SendEmailDefaults> | SendEmailDefaults;
  /** Free-form children replace the default button label/icon. */
  children?: React.ReactNode;
  className?: string;
  title?:     string;
  onSent?:    (logId: string | null) => void;
}

// Drop-in button + modal pair. Owns the open/closed state, lazily
// fetches the caller's SMTP status the first time it's clicked, and
// hands the modal a pre-resolved set of defaults so the caller stays
// a one-liner.
export default function SendEmailButton({
  target, buildDefaults, children, className, title, onSent,
}: Props) {
  const [open,       setOpen]       = useState(false);
  const [prepping,   setPrepping]   = useState(false);
  const [smtpInfo,   setSmtpInfo]   = useState<{ configured: boolean; fromEmail: string | null } | null>(null);
  const [defaults,   setDefaults]   = useState<SendEmailDefaults | undefined>(undefined);

  const handleClick = useCallback(async () => {
    setPrepping(true);
    try {
      const [smtpRes, builtDefaults] = await Promise.all([
        smtpInfo
          ? Promise.resolve({ configured: smtpInfo.configured, from_email: smtpInfo.fromEmail })
          : fetch('/api/admin/settings/smtp/me').then(r => r.json()).catch(() => ({ configured: false, from_email: null })),
        Promise.resolve(buildDefaults ? buildDefaults() : undefined),
      ]);
      setSmtpInfo({ configured: Boolean(smtpRes.configured), fromEmail: smtpRes.from_email ?? null });
      setDefaults(builtDefaults);
      setOpen(true);
    } finally {
      setPrepping(false);
    }
  }, [buildDefaults, smtpInfo]);

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={prepping}
        className={className ?? 'btn-secondary btn-sm'}
        title={title ?? 'Send a custom email'}
      >
        {prepping
          ? <Loader2 size={12} className="animate-spin" />
          : (children ?? <><Mail size={12} /> Send email</>)}
      </button>
      {open && smtpInfo && (
        <SendEmailModal
          target={target}
          defaults={defaults}
          smtpConfigured={smtpInfo.configured}
          smtpFromEmail={smtpInfo.fromEmail}
          onClose={() => setOpen(false)}
          onSent={onSent}
        />
      )}
    </>
  );
}
