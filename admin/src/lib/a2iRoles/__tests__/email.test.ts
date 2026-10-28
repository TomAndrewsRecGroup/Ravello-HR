import { describe, it, expect, beforeAll } from 'vitest';
import { normaliseLiveJob } from '../format';
import { JOB_AI_ENGINEERS, JOB_AUTOMATION_ENGINEER } from './fixtures';

beforeAll(() => { process.env.NEXT_PUBLIC_PORTAL_URL = 'https://portal.thepeoplesystem.co.uk'; });

const TEMPLATE = 'https://www.andrews-recruitment.com/jobs/{id}';
const TOKEN = '6f1c2f9e-3d4b-4b8a-9a0e-6d2b1c3e4f5a';

async function build(token: string | null, extraRole?: Record<string, unknown>) {
  const { buildRoleAlertEmail } = await import('../email');
  const roles = [normaliseLiveJob(JOB_AUTOMATION_ENGINEER), normaliseLiveJob(JOB_AI_ENGINEERS)];
  if (extraRole) roles.push(normaliseLiveJob({ ...JOB_AUTOMATION_ENGINEER, ...extraRole }));
  roles[0].clientName = 'Tarmac';
  roles[1].clientName = 'Micro1';
  return buildRoleAlertEmail({ firstName: 'Sam', roles, token, roleUrlTemplate: TEMPLATE });
}

describe('buildRoleAlertEmail', () => {
  it('links each role to andrews-recruitment.com/jobs/<id> and to its Match me page', async () => {
    const e = await build(TOKEN);
    expect(e.html).toContain('href="https://www.andrews-recruitment.com/jobs/4467043"');
    expect(e.html).toContain('href="https://www.andrews-recruitment.com/jobs/4337074"');
    expect(e.html).toContain(`href="https://portal.thepeoplesystem.co.uk/r/roles/${TOKEN}/match/4467043"`);
    expect(e.html).toContain(`href="https://portal.thepeoplesystem.co.uk/r/roles/${TOKEN}/match/4337074"`);
    expect(e.html.match(/>Match me<\/a>/g)).toHaveLength(2);
  });

  it('carries an unsubscribe link (and returns it for the List-Unsubscribe header)', async () => {
    const e = await build(TOKEN);
    expect(e.unsubscribeUrl).toBe(`https://portal.thepeoplesystem.co.uk/r/roles/${TOKEN}/unsubscribe`);
    expect(e.html).toContain(e.unsubscribeUrl);
  });

  it('never names the client', async () => {
    const e = await build(TOKEN);
    expect(e.html).not.toContain('Tarmac');
    expect(e.html).not.toContain('Micro1');
  });

  it('a preview (no token) links to the preview page, never a real token', async () => {
    const e = await build(null);
    expect(e.html).toContain('https://portal.thepeoplesystem.co.uk/r/roles/preview');
    expect(e.html).not.toMatch(/\/r\/roles\/[0-9a-f-]{36}\//);
  });

  it('escapes anything Manatal sends', async () => {
    const e = await build(TOKEN, { id: 1, position_name: '<script>alert(1)</script> Engineer' });
    expect(e.html).not.toContain('<script>alert(1)</script>');
    expect(e.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; Engineer');
  });

  it('greets by first name and counts the roles in the subject', async () => {
    const e = await build(TOKEN);
    expect(e.html).toContain('Hi Sam,');
    expect(e.subject).toBe('2 live roles this week | Athletes To Industry');
  });

  it('uses the Athletes To Industry shell', async () => {
    const e = await build(TOKEN);
    expect(e.html).toContain('Operated by Andrews Recruitment Group');
    expect(e.html).toContain('<title>Athletes To Industry</title>');
  });
});
