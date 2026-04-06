'use client';
import Sidebar from './Sidebar';
import QuickActions from './QuickActions';
import { MobileMenuProvider } from './MobileMenuContext';
import { UserPreferencesProvider } from './UserPreferences';
import { ToastProvider } from '@/components/modules/Toast';

interface Props {
  flags: Record<string, boolean>;
  counts: Record<string, number>;
  userId: string;
  companyId: string;
  uiPreferences: Record<string, any>;
  children: React.ReactNode;
}

export default function PortalShell({ flags, counts, userId, companyId, uiPreferences, children }: Props) {
  return (
    <MobileMenuProvider>
      <UserPreferencesProvider userId={userId} initialPrefs={uiPreferences}>
        <ToastProvider>
          <div className="flex min-h-screen">
            <Sidebar flags={flags} counts={counts} companyId={companyId} userId={userId} />
            <div
              className="main-content flex-1 flex flex-col min-h-screen"
              style={{ marginLeft: 'var(--sidebar-w)' }}
            >
              {children}
            </div>
          </div>
          <QuickActions />
        </ToastProvider>
      </UserPreferencesProvider>
    </MobileMenuProvider>
  );
}
