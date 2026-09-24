import Image from 'next/image';
import { Suspense } from 'react';
import AdminLoginForm from '@/components/modules/AdminLoginForm';
import { BRAND_LOGO, BRAND_NAME } from '@/lib/brand';

const LOGO = BRAND_LOGO;

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--surface)' }}>
      <div className="relative w-full max-w-[380px]">
        <div className="flex justify-center mb-8">
          <Image src={LOGO} alt={BRAND_NAME} width={187} height={40} className="h-10 w-auto" priority unoptimized />
        </div>
        <div className="rounded-[20px] p-8" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="font-display font-bold text-xl" style={{ color: 'var(--ink)' }}>Admin</h1>
            <span className="text-[9px] font-bold uppercase tracking-[0.15em] px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.25)', color: 'var(--danger)' }}>Internal</span>
          </div>
          <p className="text-sm mb-7" style={{ color: 'var(--ink-soft)' }}>Core OS 360 staff access only</p>
          <Suspense>
            <AdminLoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
