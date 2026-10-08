import { redirect } from 'next/navigation';
import { isRouteEnabled } from '@/lib/moduleAccess';
import { currentModuleFlags } from '@/lib/auth/moduleFlags';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { leadTabsFlat } from '@/lib/lead/tabs';

// Land on the first tab this client can actually reach, walked in the
// EXACT order layout.tsx's own tab groups render on screen — the
// top-left tab must be the one that loads by default. Until
// 2026-10-08 this redirect used its own, separately hand-typed order
// (landing on Document Templates) that had drifted from the real,
// displayed tab order (which opens on Employees) — never maintain a
// second copy of that order again.
export default async function LeadIndexPage() {
  const flags = await currentModuleFlags();
  const tabs = leadTabsFlat().filter(t => isRouteEnabled(t.href, flags));
  let caps: Set<string> | null = null;
  for (const tab of tabs) {
    if (!tab.cap) return redirect(tab.href);
    if (caps === null) {
      const supabase = await createServerSupabaseClient();
      const { data } = await supabase.rpc('my_capabilities');
      caps = new Set(Array.isArray(data) ? (data as string[]) : []);
    }
    if (caps.has(tab.cap)) return redirect(tab.href);
  }
  redirect('/dashboard');
}
