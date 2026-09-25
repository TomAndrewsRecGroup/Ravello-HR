import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOTIFICATION_TYPES } from '../types';

// The portal bell's icon map and the shared vocabulary agree in both
// directions (see the admin twin of this test).

const bell = readFileSync(resolve(__dirname, '../../../components/modules/NotificationBell.tsx'), 'utf8');
const block = bell.slice(bell.indexOf('const TYPE_META'), bell.indexOf('export const BELL_TYPE_KEYS'));
const keys = [...block.matchAll(/^\s{2}(\w+):\s*\{ Icon:/gm)].map(m => m[1]).sort();

describe('portal notification bell', () => {
  it('covers exactly the vocabulary', () => {
    expect(keys).toEqual([...NOTIFICATION_TYPES].sort());
  });
  it('is typed against the union', () => {
    expect(block).toMatch(/Record<NotificationType, \{ Icon/);
  });
});
