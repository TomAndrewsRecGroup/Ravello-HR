'use client';

// A tiny, reusable primitive for "warn about unsaved work" — the one
// piece of Core-OS 360 Phase 6, Group 7 (section 12: Client Switcher
// Hardening) with no existing mechanism anywhere in this codebase to
// build on (a repo-wide search found zero beforeunload listeners in
// either app before this).
//
// Retrofitting every existing form was out of scope for one group —
// that would touch dozens of files for a single line each, exactly
// the kind of broad, un-gated change this codebase's own incremental-
// group discipline exists to avoid. This hook is the reusable
// building block instead: any form, new or existing, adopts it with
// one line (`useUnsavedChangesWarning(isDirty)`), and the browser's
// own native "leave site?" prompt does the rest — no custom dialog,
// no app-level dirty-tracking framework to build or drift out of
// sync. ClientActionForms.tsx (Group 7's own new service-scope and
// manual-ledger forms) is the first adopter; nothing else in the
// platform uses it yet.
//
// Deliberately native, not a custom modal: `window.location.assign()`
// (OrganisationBar's own switch action, and every full navigation in
// this codebase) triggers a REAL browser navigation, and only the
// native beforeunload event can intercept that — a custom "are you
// sure" dialog shown before calling assign() would need every caller
// to remember to check it, while this fires automatically for ANY
// navigation, switch included, the moment a listening form is dirty.

import { useEffect } from 'react';

export function useUnsavedChangesWarning(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome requires returnValue to be set; the string itself is
      // never shown — every modern browser renders its own fixed text.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}
