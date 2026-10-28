import { describe, it, expect } from 'vitest';
import { isLiveJob, normaliseLiveJob, publicRoleFields, roleUrl, salaryText, sortRoles, summaryText } from '../format';
import { JOB_AI_ENGINEERS, JOB_AUTOMATION_ENGINEER, JOB_COMPLIANCE_LEAD } from './fixtures';

const now = new Date('2026-10-28T12:00:00Z');

describe('normaliseLiveJob — real Manatal v3 jobs', () => {
  it('Automation Engineer (GBP, yearly, salary hidden on the job)', () => {
    const r = normaliseLiveJob(JOB_AUTOMATION_ENGINEER);
    expect(r).toMatchObject({
      id: '4467043',
      title: 'Automation Engineer',
      location: 'Macclesfield',
      contract: 'Full-time',
      salary: null,
      industry: 'Building Materials',
      organizationId: '4247425',
      clientName: null,
    });
    expect(r.summary.startsWith('Are you an Automation Engineer, Controls Engineer or EC&I Engineer')).toBe(true);
    expect(r.summary).not.toContain('Excellent Salary');
    expect(r.summary.length).toBeLessThanOrEqual(261);
  });

  it('AI & Software Engineers (USD, hourly, remote)', () => {
    const r = normaliseLiveJob(JOB_AI_ENGINEERS);
    expect(r.location).toBe('London · Remote');
    expect(r.contract).toBe('Contract');
    expect(r.industry).toBe('Engineering - Others');
    expect(r.summary.startsWith('We are recruiting for multiple opportunities')).toBe(true);
    // Stops before "There are currently two routes available:" rather
    // than ending the teaser on a dangling colon.
    expect(r.summary.endsWith('software engineering projects.')).toBe(true);
  });

  it('Compliance & Transport Lead: a heading never runs into the first sentence', () => {
    const r = normaliseLiveJob(JOB_COMPLIANCE_LEAD);
    expect(r.summary).toBe('Andrews Recruitment Group is recruiting a Compliance & Transport Lead for an established concrete production, delivery and pumping business based in Warwickshire.');
    expect(r.summary).not.toContain('Take Ownership');
  });
});

describe('salaryText', () => {
  it('shows nothing when the recruiter hid the salary on the job', () => {
    expect(salaryText(JOB_AUTOMATION_ENGINEER)).toBeNull();
  });
  it('shows nothing when visibility is not stated', () => {
    expect(salaryText({ ...JOB_AUTOMATION_ENGINEER, is_salary_visible: undefined })).toBeNull();
  });
  it('formats a visible GBP yearly range', () => {
    expect(salaryText({ ...JOB_AUTOMATION_ENGINEER, is_salary_visible: true })).toBe('£40,000–£45,000 per year');
  });
  it('formats a visible USD hourly range', () => {
    expect(salaryText({ ...JOB_AI_ENGINEERS, is_salary_visible: true })).toBe('$60–$120 per hour');
  });
  it('one-sided and equal figures', () => {
    expect(salaryText({ ...JOB_AUTOMATION_ENGINEER, is_salary_visible: true, salary_max: null })).toBe('From £40,000 per year');
    expect(salaryText({ ...JOB_AUTOMATION_ENGINEER, is_salary_visible: true, salary_min: null })).toBe('Up to £45,000 per year');
    expect(salaryText({ ...JOB_AUTOMATION_ENGINEER, is_salary_visible: true, salary_max: '40000.00' })).toBe('£40,000 per year');
  });
  it('an unknown currency shows its code', () => {
    expect(salaryText({ ...JOB_AUTOMATION_ENGINEER, is_salary_visible: true, currency: 'AED' })).toBe('AED 40,000–AED 45,000 per year');
  });
});

describe('isLiveJob', () => {
  it('active, published, open', () => {
    expect(isLiveJob(JOB_AUTOMATION_ENGINEER, now)).toBe(true);
  });
  it('a role past its close date is not live', () => {
    expect(isLiveJob({ ...JOB_AUTOMATION_ENGINEER, close_at: '2026-10-27T00:00:00Z' }, now)).toBe(false);
    expect(isLiveJob({ ...JOB_AUTOMATION_ENGINEER, close_at: '2026-10-30T00:00:00Z' }, now)).toBe(true);
  });
  it('on hold, won or unpublished is not live', () => {
    expect(isLiveJob({ ...JOB_AUTOMATION_ENGINEER, status: 'on_hold' }, now)).toBe(false);
    expect(isLiveJob({ ...JOB_AUTOMATION_ENGINEER, status: 'won' }, now)).toBe(false);
    expect(isLiveJob({ ...JOB_AUTOMATION_ENGINEER, is_published: false }, now)).toBe(false);
  });
});

describe('summaryText', () => {
  it('falls back to the first non-title line when nothing is paragraph-length', () => {
    expect(summaryText('<p>Engineer</p><p>Leeds | £30k</p>', 'Engineer')).toBe('Leeds | £30k');
  });
  it('skips a headline paragraph with no full stop, and keeps whole sentences', () => {
    const html = '<p><strong>A rare chance to lead a growing engineering team in the Midlands</strong></p>'
      + '<p>We are recruiting a Maintenance Manager for a busy manufacturing site in Coventry.</p>'
      + '<p>You will lead a team of twelve engineers across three shifts and report to the Plant Director.</p>'
      + '<p>The site runs continuous production lines with a strong focus on planned maintenance.</p>';
    expect(summaryText(html, 'Maintenance Manager')).toBe(
      'We are recruiting a Maintenance Manager for a busy manufacturing site in Coventry. '
      + 'You will lead a team of twelve engineers across three shifts and report to the Plant Director.',
    );
  });
  it('is empty for an empty description', () => {
    expect(summaryText(null, 'X')).toBe('');
  });
  it('cuts long text at a word boundary with an ellipsis', () => {
    const long = `<p>${'word '.repeat(120)}</p>`;
    const s = summaryText(long, 'T');
    expect(s.endsWith('…')).toBe(true);
    expect(s.length).toBeLessThanOrEqual(261);
    expect(s).not.toMatch(/wor…$/);
  });
});

describe('links and visibility', () => {
  it('builds the andrews-recruitment.com page from the Manatal job id', () => {
    expect(roleUrl('https://www.andrews-recruitment.com/jobs/{id}', '4467043'))
      .toBe('https://www.andrews-recruitment.com/jobs/4467043');
  });
  it('the athlete-facing fields never include the client name', () => {
    const r = { ...normaliseLiveJob(JOB_AUTOMATION_ENGINEER), clientName: 'Tarmac' };
    const pub = publicRoleFields(r);
    expect(JSON.stringify(pub)).not.toContain('Tarmac');
    expect(Object.keys(pub)).not.toContain('clientName');
  });
  it('sorts newest role first', () => {
    const sorted = sortRoles([normaliseLiveJob(JOB_AI_ENGINEERS), normaliseLiveJob(JOB_AUTOMATION_ENGINEER)]);
    expect(sorted.map(r => r.id)).toEqual(['4467043', '4337074']);
  });
});
