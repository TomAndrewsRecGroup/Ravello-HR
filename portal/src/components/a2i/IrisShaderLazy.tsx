'use client';

import dynamic from 'next/dynamic';

// Mirrors the Athletes To Industry site: load the WebGL iris shader
// client-only (no SSR), post-LCP.
const IrisShader = dynamic(
  () => import('./IrisShader').then((m) => m.IrisShader),
  { ssr: false, loading: () => null },
);

export function IrisShaderLazy() {
  return <IrisShader />;
}
