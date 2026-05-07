'use client';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { useLockedFeature } from './LockedFeature';

interface Props {
  hiringEnabled: boolean;
}

export default function RaiseRoleButton({ hiringEnabled }: Props) {
  const locked = useLockedFeature();

  if (!hiringEnabled) {
    return (
      <button
        onClick={() => locked.show('Raise a Role')}
        className="btn-cta btn-sm inline-flex items-center gap-1.5"
        style={{ opacity: 0.6 }}
      >
        <Lock size={12} /> Raise a Role
      </button>
    );
  }

  return (
    <Link prefetch={false} href="/hire/hiring/new" className="btn-cta btn-sm">
      + Raise a Role
    </Link>
  );
}
