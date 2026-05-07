'use client';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { useLockedFeature } from './LockedFeature';

interface Props {
  href: string;
  flagEnabled: boolean;
  featureLabel: string;
  className?: string;
  style?: React.CSSProperties;
  showLockIcon?: boolean;
  children: React.ReactNode;
}

/**
 * Renders a normal Next <Link> when the customer has the package,
 * or a button that opens the upgrade modal when they don't. Used to
 * keep dashboard widgets visually present (counts, headers, "View all"
 * links) even when the underlying package is off — the user can see
 * what's available, but can't navigate into a package they haven't
 * bought.
 */
export default function LockedLink({
  href, flagEnabled, featureLabel, className, style, showLockIcon, children,
}: Props) {
  const locked = useLockedFeature();

  if (flagEnabled) {
    return (
      <Link prefetch={false} href={href} className={className} style={style}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => locked.show(featureLabel)}
      className={className}
      style={{ ...style, opacity: 0.55, cursor: 'pointer' }}
    >
      {showLockIcon && <Lock size={11} style={{ display: 'inline', marginRight: 4 }} />}
      {children}
    </button>
  );
}
