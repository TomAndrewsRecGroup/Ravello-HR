'use client';
import { usePathname } from 'next/navigation';
import SocialProofTicker from './SocialProofTicker';

const EXCLUDED_PREFIXES = ['/tools', '/book', '/lead'];

export default function ConditionalTicker() {
  const pathname = usePathname();
  const hidden = EXCLUDED_PREFIXES.some((p) => pathname.startsWith(p));
  if (hidden) return null;
  return <SocialProofTicker />;
}
