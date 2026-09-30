import { describe, expect, it } from 'vitest';
import { contentIsEmpty, radarGeometry, FIT_LABEL, type DevPlanContent, type DevPlanStrength } from '../devPlan';

// Core-OS 360 Completion Programme, Phase 29 (PL.1) — Development Plans
// preservation test, slice 1: the shared content model. This file is
// mirrored byte-identical in admin/ (check-shared-dupes.sh), so a real
// test here proves the model for both apps at once — the same logic
// PlanEditor.tsx (admin, the writer) and DevPlanDocument.tsx (both
// apps, the reader) both trust.
//
// `content`/`strengths` are stored as JSONB (migration 076). JSONB's
// own round-trip is exactly JSON.stringify/JSON.parse semantics — no
// column-level truncation, no type coercion beyond what JSON itself
// does — so exercising that pair here is a faithful proof of "no
// silent truncation or section loss" without needing a live database:
// if a field survives JSON.stringify → JSON.parse unchanged, it will
// survive the JSONB column unchanged too.

describe('DevPlanContent — JSONB round-trip (no silent field loss)', () => {
  it('round-trips every section of a fully-populated report exactly', () => {
    const content: DevPlanContent = {
      cover: {
        report_kind: 'Athlete Transition Report',
        tagline: 'From the pitch to the boardroom',
        date_label: 'July 2026',
        location: 'Leeds, UK',
        prepared_by: 'Core OS 360',
      },
      exec_summary: { heading: 'Executive Summary', body_html: '<p>A proven leader with <strong>12 years</strong> of experience.</p>' },
      positioning: '<blockquote>"Discipline translates directly to the boardroom."</blockquote>',
      profile: {
        facts: [{ k: 'Sport', v: 'Rugby Union' }, { k: 'Position', v: 'Prop' }],
        career: ['Captained the first team for 4 seasons', 'Mentored 6 academy players'],
        education_html: '<p>BSc Sports Science, Leeds Beckett University</p>',
      },
      career_overview: {
        heading: 'Career Overview',
        body_html: '<p>15 years at the top level.</p>',
        bullets: ['Premiership winner 2021', 'England U20 international'],
      },
      findings: [
        { heading: 'Leadership', body_html: '<p>Consistently sought out as a captain and mentor.</p>' },
        { heading: 'Resilience', body_html: '<p>Recovered from two major injuries mid-career.</p>' },
      ],
      brand_partnerships: ['Local sports nutrition brand', 'Regional gym chain'],
      personality: [{ label: 'Driven', body: 'Sets and pursues ambitious goals.' }],
      career_paths: [
        { title: 'Operations Management', body: 'Strong fit given team-leadership background.', fit: 'strongest' },
        { title: 'Sales', body: 'Good relationship-building skills.', fit: 'emerging' },
      ],
      companies: [{ category: 'Manufacturing', items: ['Acme Industrial', 'Northern Build Co'] }],
      opportunity: { heading: 'The Opportunity', body_html: '<p>Ready for a graduate leadership programme.</p>', bullets: ['Available immediately'] },
      assessment: { body_html: '<p>A strong candidate for a fast-tracked leadership role.</p>' },
    };

    const roundTripped = JSON.parse(JSON.stringify(content)) as DevPlanContent;

    // Every top-level section survives, not just the top-level keys —
    // a shallow round-trip could hide a nested array/object being lost.
    expect(roundTripped).toEqual(content);
    expect(roundTripped.cover?.prepared_by).toBe('Core OS 360');
    expect(roundTripped.profile?.facts).toHaveLength(2);
    expect(roundTripped.findings).toHaveLength(2);
    expect(roundTripped.findings?.[1].body_html).toContain('two major injuries');
    expect(roundTripped.career_paths?.[0].fit).toBe('strongest');
    expect(roundTripped.companies?.[0].items).toEqual(['Acme Industrial', 'Northern Build Co']);
  });

  it('round-trips a minimal, mostly-undefined content object without inventing fields', () => {
    const content: DevPlanContent = { positioning: 'Just a quote.' };
    const roundTripped = JSON.parse(JSON.stringify(content)) as DevPlanContent;
    expect(roundTripped).toEqual({ positioning: 'Just a quote.' });
    expect(roundTripped.exec_summary).toBeUndefined();
    expect(roundTripped.findings).toBeUndefined();
  });

  it('preserves HTML content byte-for-byte, including quotes and nested tags', () => {
    const html = '<p>A "quoted" phrase with <em>emphasis</em> and a & ampersand.</p>';
    const content: DevPlanContent = { exec_summary: { body_html: html } };
    const roundTripped = JSON.parse(JSON.stringify(content)) as DevPlanContent;
    expect(roundTripped.exec_summary?.body_html).toBe(html);
  });

  it('contentIsEmpty is true for null, undefined and an object with only unset fields', () => {
    expect(contentIsEmpty(null)).toBe(true);
    expect(contentIsEmpty(undefined)).toBe(true);
    expect(contentIsEmpty({})).toBe(true);
    expect(contentIsEmpty({ cover: { report_kind: 'x' } })).toBe(true); // cover alone never counts
  });

  it('contentIsEmpty is false the moment any real section has content', () => {
    expect(contentIsEmpty({ positioning: 'x' })).toBe(false);
    expect(contentIsEmpty({ exec_summary: { body_html: 'x' } })).toBe(false);
    expect(contentIsEmpty({ findings: [{ heading: 'a', body_html: 'b' }] })).toBe(false);
    expect(contentIsEmpty({ profile: { facts: [{ k: 'a', v: 'b' }] } })).toBe(false);
  });
});

describe('FIT_LABEL', () => {
  it('has a label for every CareerFit value', () => {
    expect(FIT_LABEL.strongest).toBe('Strongest fit');
    expect(FIT_LABEL.strong).toBe('Strong');
    expect(FIT_LABEL.emerging).toBe('Emerging');
  });
});

describe('radarGeometry', () => {
  const strengths: DevPlanStrength[] = [
    { label: 'Leadership', rating: 5 },
    { label: 'Communication', rating: 4 },
    { label: 'Resilience', rating: 3 },
  ];

  it('produces one vertex/label per strength, in the same order', () => {
    const geo = radarGeometry(strengths);
    expect(geo.vertices).toHaveLength(3);
    expect(geo.labels).toHaveLength(3);
    expect(geo.vertices.map(v => v.label)).toEqual(['Leadership', 'Communication', 'Resilience']);
    expect(geo.vertices.map(v => v.rating)).toEqual([5, 4, 3]);
  });

  it('produces max rings, each a non-empty polygon', () => {
    const geo = radarGeometry(strengths, 330, 118, 5);
    expect(geo.rings).toHaveLength(5);
    for (const ring of geo.rings) expect(ring.length).toBeGreaterThan(0);
  });

  it('clamps an out-of-range rating rather than drawing off the chart', () => {
    const geo = radarGeometry([{ label: 'Over', rating: 99 }, { label: 'Under', rating: -5 }]);
    // Both vertices sit at the same distance from centre once clamped
    // to 5 and 0 respectively — the "Over" vertex must not be further
    // out than the max ring's own radius.
    const cx = geo.cx, cy = geo.cy;
    const dist = (p: { x: number; y: number }) => Math.hypot(p.x - cx, p.y - cy);
    expect(dist(geo.vertices[0])).toBeLessThanOrEqual(geo.radius + 0.5);
    expect(dist(geo.vertices[1])).toBeCloseTo(0, 0);
  });

  it('treats fewer than 3 strengths as a 3-sided shape (never collapses to a line)', () => {
    const geo = radarGeometry([{ label: 'Only one', rating: 5 }]);
    expect(geo.spokes).toHaveLength(1);
    // With n forced to 3 internally, the single vertex still sits on
    // a real polygon vertex, not degenerate at the centre.
    const dist = Math.hypot(geo.vertices[0].x - geo.cx, geo.vertices[0].y - geo.cy);
    expect(dist).toBeGreaterThan(0);
  });
});
