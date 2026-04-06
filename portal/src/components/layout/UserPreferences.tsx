'use client';
import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

interface UIPreferences {
  sidebar_order: string[];
  sidebar_hidden: string[];
  quick_actions: string[];
  pinned_pages: string[];
}

const DEFAULT_PREFS: UIPreferences = {
  sidebar_order: [],
  sidebar_hidden: [],
  quick_actions: ['raise_role', 'log_leave', 'raise_ticket', 'upload_doc'],
  pinned_pages: [],
};

interface UserPreferencesContextValue {
  prefs: UIPreferences;
  updatePrefs: (partial: Partial<UIPreferences>) => Promise<void>;
  loaded: boolean;
}

const UserPreferencesContext = createContext<UserPreferencesContextValue>({
  prefs: DEFAULT_PREFS,
  updatePrefs: async () => {},
  loaded: false,
});

export function useUserPreferences() {
  return useContext(UserPreferencesContext);
}

export function UserPreferencesProvider({ userId, initialPrefs, children }: {
  userId: string;
  initialPrefs: Record<string, any>;
  children: React.ReactNode;
}) {
  const [prefs, setPrefs] = useState<UIPreferences>({
    ...DEFAULT_PREFS,
    ...initialPrefs,
  });
  const [loaded, setLoaded] = useState(true);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const updatePrefs = useCallback(async (partial: Partial<UIPreferences>) => {
    const updated = { ...prefsRef.current, ...partial };
    setPrefs(updated);
    prefsRef.current = updated;

    const supabase = createClient();
    const { error } = await supabase
      .from('profiles')
      .update({ ui_preferences: updated })
      .eq('id', userId);
    if (error) console.error('Failed to save preferences:', error);
  }, [userId]);

  return (
    <UserPreferencesContext.Provider value={{ prefs, updatePrefs, loaded }}>
      {children}
    </UserPreferencesContext.Provider>
  );
}
