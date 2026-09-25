import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS } from '../types';

// The bell's icon map and the vocabulary must agree in both directions:
// a type with no icon renders as "general"; an icon for a type nothing
// writes is a feature somebody believes exists (nine of them did).

const bell = readFileSync(resolve(__dirname, '../../../components/modules/NotificationBell.tsx'), 'utf8');
const block = bell.slice(bell.indexOf('const TYPE_CONFIG'), bell.indexOf('export const BELL_TYPE_KEYS'));
const keys = [...block.matchAll(/^\s{2}(\w+):\s*\{ icon:/gm)].map(m => m[1]).sort();

describe('notification types', () => {
  it('the admin bell covers exactly the vocabulary', () => {
    expect(keys).toEqual([...NOTIFICATION_TYPES].sort());
  });
  it('every type has a label', () => {
    expect(Object.keys(NOTIFICATION_TYPE_LABELS).sort()).toEqual([...NOTIFICATION_TYPES].sort());
  });
  it('the bell is typed against the union, so a stray key cannot compile', () => {
    expect(block).toMatch(/Record<NotificationType, \{ icon/);
  });
});
