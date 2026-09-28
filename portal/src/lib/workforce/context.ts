import { getSafetyContext, type SafetyContext } from '@/lib/hs/safetyContext';

// Everything a workforce page needs about the viewer: the safety context
// (the ACTIVE organisation, capabilities) plus the viewer's own person in
// that organisation (132 my_person_id), for self-service.
//
// `can()` only decides which buttons to OFFER. Every read is RLS and
// person_visible; every write is RLS, the 133-137 guards and RPCs.

export interface WorkforceContext extends SafetyContext {
  myPersonId: string | null;
}

export async function getWorkforceContext(): Promise<WorkforceContext> {
  const ctx = await getSafetyContext();
  let myPersonId: string | null = null;
  if (ctx.companyId && ctx.userId) {
    const { data } = await ctx.supabase.rpc('my_person_id', { p_org: ctx.companyId });
    myPersonId = (data as string | null) ?? null;
  }
  return { ...ctx, myPersonId };
}
