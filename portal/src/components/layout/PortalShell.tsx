'use client';
import Sidebar from './Sidebar';
import QuickActions from './QuickActions';
import { MobileMenuProvider } from './MobileMenuContext';
import { UserPreferencesProvider } from './UserPreferences';
import { LockedFeatureProvider } from './LockedFeature';
import { ToastProvider } from '@/components/modules/Toast';
import OrganisationBar from './OrganisationBar';
import type { OrganisationOption } from '@/lib/auth/activeOrganisation';

interface Props {
  flags: Record<string, boolean>;
  counts: Record<string, number>;
  userId: string;
  companyId: string;
  role: string;
  showBilling: boolean;
  uiPreferences: Record<string, any>;
  accountManagerName:  string | null;
  accountManagerEmail: string | null;
  /** Home + live grants (Core-OS 360 consultancy mode). */
  organisations?: OrganisationOption[];
  activeCompanyName?: string | null;
  children: React.ReactNode;
}

export default function PortalShell({
  flags, counts, userId, companyId, role, showBilling, uiPreferences,
  accountManagerName, accountManagerEmail, organisations = [], activeCompanyName = null, children,
}: Props) {
  return (
    <MobileMenuProvider>
      <UserPreferencesProvider userId={userId} initialPrefs={uiPreferences}>
        <LockedFeatureProvider accountManagerName={accountManagerName} accountManagerEmail={accountManagerEmail}>
          <ToastProvider>
            <div className="flex min-h-screen">
              <Sidebar flags={flags} counts={counts} companyId={companyId} userId={userId} role={role} showBilling={showBilling} />
              <div
                className="main-content flex-1 flex flex-col min-h-screen"
                style={{ marginLeft: 'var(--sidebar-w)' }}
              >
                <OrganisationBar organisations={organisations} activeCompanyName={activeCompanyName} />
                {children}
              </div>
            </div>
            <QuickActions flags={flags} />
          </ToastProvider>
        </LockedFeatureProvider>
      </UserPreferencesProvider>
    </MobileMenuProvider>
  );
}
