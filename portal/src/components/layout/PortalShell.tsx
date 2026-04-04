'use client';
import Sidebar from './Sidebar';
import QuickActions from './QuickActions';
import { MobileMenuProvider } from './MobileMenuContext';
import { ToastProvider } from '@/components/modules/Toast';

interface Props {
  flags: Record<string, boolean>;
  counts: Record<string, number>;
  children: React.ReactNode;
}

export default function PortalShell({ flags, counts, children }: Props) {
  return (
    <MobileMenuProvider>
      <ToastProvider>
        <div className="flex min-h-screen">
          <Sidebar flags={flags} counts={counts} />
          <div
            className="main-content flex-1 flex flex-col min-h-screen"
            style={{ marginLeft: 'var(--sidebar-w)' }}
          >
            {children}
          </div>
        </div>
        <QuickActions />
      </ToastProvider>
    </MobileMenuProvider>
  );
}
