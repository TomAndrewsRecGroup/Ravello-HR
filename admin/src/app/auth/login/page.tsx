import Image from 'next/image';
import { Suspense } from 'react';
import AdminLoginForm from '@/components/modules/AdminLoginForm';

const LOGO = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#FAFAF8' }}>
      <div className="relative w-full max-w-[380px]">
        <div className="flex justify-center mb-8">
          <Image src={LOGO} alt="The People Office" width={130} height={44} className="h-10 w-auto brightness-110" priority />
        </div>
        <div className="rounded-[20px] p-8" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="font-display font-bold text-xl" style={{ color: '#0A0F1E' }}>Admin</h1>
            <span className="text-[9px] font-bold uppercase tracking-[0.15em] px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.25)', color: '#DC2626' }}>Internal</span>
          </div>
          <p className="text-sm mb-7" style={{ color: '#4B5563' }}>The People Office staff access only</p>
          <Suspense>
            <AdminLoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
