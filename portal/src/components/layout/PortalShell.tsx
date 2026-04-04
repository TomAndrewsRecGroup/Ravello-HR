'use client';
import Sidebar from './Sidebar';
import { MobileMenuProvider } from './MobileMenuContext';

interface Props {
  flags: Record<string, boolean>;
  counts: Record<string, number>;
  children: React.ReactNode;
}

export default function PortalShell({ flags, counts, children }: Props) {
  return (
    <MobileMenuProvider>
      <div className="flex min-h-screen">
        <Sidebar flags={flags} counts={counts} />
        <div
          className="main-content flex-1 flex flex-col min-h-screen"
          style={{ marginLeft: 'var(--sidebar-w)' }}
        >
          {children}
        </div>
      </div>
    </MobileMenuProvider>
  );
}
