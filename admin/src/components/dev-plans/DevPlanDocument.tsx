import { sanitizeHtml } from '@/lib/sanitizeHtml';
import {
  contentIsEmpty,
  FIT_LABEL,
  type CareerFit,
  type DevPlanContent,
  type DevPlanStrength,
} from '@/lib/devPlan';
import StrengthsRadar from './StrengthsRadar';

// Default Athletes to Industry logo (Vercel blob) — the house brand
// for every plan. A brand_profiles logo (logoUrl) overrides it.
const A2I_LOGO =
  'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/Athletes%20To%20Industry%20Option%20A.png';

export interface DevPlanMilestone {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  sort_order: number;
}
export interface FreeTextItem { box1: string; box2: string }

export interface DevPlanDocumentProps {
  title: string;
  athleteName?: string | null;
  companyName?: string | null;
  logoUrl?: string | null;
  content: DevPlanContent | null | undefined;
  strengths: DevPlanStrength[];
  summary?: string | null;
  milestones?: DevPlanMilestone[];
  trainingItems?: FreeTextItem[] | null;
  rolesItems?: FreeTextItem[] | null;
}

function RichText({ html, className }: { html?: string | null; className?: string }) {
  const clean = sanitizeHtml(html);
  if (!clean) return null;
  return <div className={`dp-prose${className ? ` ${className}` : ''}`} dangerouslySetInnerHTML={{ __html: clean }} />;
}

function Bullets({ items }: { items?: string[] | null }) {
  const list = (items ?? []).map(s => s?.trim()).filter(Boolean);
  if (list.length === 0) return null;
  return (
    <ul className="dp-list">
      {list.map((s, i) => <li key={i}>{s}</li>)}
    </ul>
  );
}

export default function DevPlanDocument(props: DevPlanDocumentProps) {
  const c: DevPlanContent = props.content ?? {};
  const cover = c.cover ?? {};
  const empty = contentIsEmpty(c);
  const strengths = (props.strengths ?? []).filter(s => s.label?.trim());
  const milestones = (props.milestones ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const training = (props.trainingItems ?? []).filter(it => it.box1 || it.box2);
  const roles = (props.rolesItems ?? []).filter(it => it.box1 || it.box2);

  const coverName = props.athleteName?.trim() || props.title;
  const logo = props.logoUrl || A2I_LOGO;

  const metaItems = [
    cover.date_label && { k: 'Prepared', v: cover.date_label },
    cover.location && { k: 'Location', v: cover.location },
    (cover.prepared_by || props.companyName) && { k: 'Prepared by', v: cover.prepared_by || 'The People System' },
  ].filter(Boolean) as { k: string; v: string }[];

  return (
    <div className="dp print-area">
      {/* ─────────────── COVER ─────────────── */}
      <section className="dp-page dp-cover print-keep-color">
        <div className="dp-cover-glow" />
        <div className="dp-cover-grain" />
        <div className="dp-cover-inner">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="dp-cover-logo" src={logo} alt="Athletes to Industry" />
            <div className="dp-eyebrow" style={{ textAlign: 'right', paddingTop: 6 }}>
              {cover.report_kind || 'Athlete Transition Report'}
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
            <hr className="dp-gold-rule" />
            <div className="dp-cover-kicker">Development Plan</div>
            <h1 className="dp-cover-name">{coverName}</h1>
            {(cover.tagline || props.summary) && (
              <p className="dp-cover-role">{cover.tagline || props.summary}</p>
            )}
          </div>

          {metaItems.length > 0 && (
            <div className="dp-cover-meta">
              {metaItems.map((m, i) => (
                <div key={i}><div className="k">{m.k}</div><div className="v">{m.v}</div></div>
              ))}
            </div>
          )}
          <hr className="dp-gold-rule" style={{ width: '100%', margin: '22px 0 14px', opacity: 0.3 }} />
          <div className="dp-cover-foot">
            <span>Athletes to Industry — Athlete Transition Programme</span>
            <span>Private &amp; Confidential</span>
          </div>
        </div>
      </section>

      {/* ─────────────── BODY ─────────────── */}
      <section className="dp-page print-keep-color">
        <div className="dp-pad">

          {/* Executive summary (or legacy summary fallback) */}
          {c.exec_summary?.body_html ? (
            <div className="dp-section">
              <div className="dp-sec-label">Executive Summary</div>
              {c.exec_summary.heading && <h2 className="dp-sec-title">{c.exec_summary.heading}</h2>}
              <RichText html={c.exec_summary.body_html} className="lead" />
            </div>
          ) : (empty && props.summary) ? (
            <div className="dp-section">
              <div className="dp-sec-label">Overview</div>
              <p className="dp-prose lead" style={{ whiteSpace: 'pre-wrap' }}>{props.summary}</p>
            </div>
          ) : null}

          {/* Positioning callout */}
          {c.positioning && (
            <div className="dp-section">
              <div className="dp-callout print-keep-color"><RichText html={c.positioning} /></div>
            </div>
          )}

          {/* Athlete profile */}
          {(c.profile?.facts?.length || c.profile?.career?.length || c.profile?.education_html) && (
            <div className="dp-section">
              <div className="dp-sec-label">Athlete Profile</div>
              {!!c.profile?.facts?.length && (
                <div className="dp-facts">
                  {c.profile.facts.filter(f => f.k || f.v).map((f, i) => (
                    <div key={i} className="dp-fact"><div className="k">{f.k}</div><div className="v">{f.v}</div></div>
                  ))}
                </div>
              )}
              {!!c.profile?.career?.length && (<><h3 className="dp-sub">Professional Career</h3><Bullets items={c.profile.career} /></>)}
              <RichText html={c.profile?.education_html} />
            </div>
          )}

          {/* Career overview */}
          {(c.career_overview?.body_html || c.career_overview?.bullets?.length) && (
            <div className="dp-section">
              <div className="dp-sec-label">Career Overview</div>
              {c.career_overview?.heading && <h2 className="dp-sec-title">{c.career_overview.heading}</h2>}
              <RichText html={c.career_overview?.body_html} />
              <Bullets items={c.career_overview?.bullets} />
            </div>
          )}

          {/* Discovery findings */}
          {!!c.findings?.length && (
            <div className="dp-section">
              <div className="dp-sec-label">Key Findings</div>
              {c.findings.filter(f => f.heading || f.body_html).map((f, i) => (
                <div key={i}>{f.heading && <h3 className="dp-sub">{f.heading}</h3>}<RichText html={f.body_html} /></div>
              ))}
              {!!c.brand_partnerships?.length && (
                <>
                  <h3 className="dp-sub">Brand Partnerships</h3>
                  <div className="dp-chips">
                    {c.brand_partnerships.filter(Boolean).map((b, i) => <span key={i} className="dp-chip">{b}</span>)}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Personality */}
          {!!c.personality?.length && (
            <div className="dp-section">
              <div className="dp-sec-label">Personality Assessment</div>
              <div className="dp-traits">
                {c.personality.filter(t => t.label || t.body).map((t, i) => (
                  <div key={i} className="dp-trait print-keep-color"><h4>{t.label}</h4><p>{t.body}</p></div>
                ))}
              </div>
            </div>
          )}

          {/* Strengths radar */}
          {strengths.length >= 3 && (
            <div className="dp-section">
              <div className="dp-sec-label">Areas of Strength</div>
              <h2 className="dp-sec-title">Strengths Profile</h2>
              <div className="dp-strengths">
                <div className="dp-radar-wrap"><StrengthsRadar strengths={strengths} /></div>
                <div className="dp-bars">
                  {strengths.map((s, i) => (
                    <div key={i} className="dp-bar-row">
                      <div className="dp-bar-label">{s.label}</div>
                      <div className="dp-bar-val">{s.rating.toFixed(1)}</div>
                      <div className="dp-bar-track print-keep-color">
                        <div className="dp-bar-fill print-keep-color" style={{ width: `${Math.min(100, Math.max(0, (s.rating / 5) * 100))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Career paths */}
          {!!c.career_paths?.length && (
            <div className="dp-section">
              <div className="dp-sec-label">Potential Career Paths</div>
              <div className="dp-paths">
                {c.career_paths.filter(p => p.title || p.body).map((p, i) => (
                  <div key={i} className="dp-path print-keep-color">
                    <div className="dp-path-num">{i + 1}</div>
                    <div><h4>{p.title}</h4><p>{p.body}</p></div>
                    <div className={`dp-fit ${p.fit} print-keep-color`}>{FIT_LABEL[(p.fit as CareerFit) ?? 'strong'] ?? 'Strong'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Target companies */}
          {!!c.companies?.length && (
            <div className="dp-section">
              <div className="dp-sec-label">Companies Worth Exploring</div>
              <div className="dp-companies">
                {c.companies.filter(cat => cat.category || cat.items?.length).map((cat, i) => (
                  <div key={i} className="dp-company-cat print-keep-color">
                    <h4>{cat.category}</h4>
                    <div className="dp-chips">
                      {(cat.items ?? []).filter(Boolean).map((it, j) => <span key={j} className="dp-chip">{it}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Opportunity */}
          {(c.opportunity?.body_html || c.opportunity?.bullets?.length) && (
            <div className="dp-section">
              <div className="dp-sec-label">Opportunity Within A2I</div>
              {c.opportunity?.heading && <h2 className="dp-sec-title">{c.opportunity.heading}</h2>}
              <RichText html={c.opportunity?.body_html} />
              <Bullets items={c.opportunity?.bullets} />
            </div>
          )}

          {/* Overall assessment */}
          {c.assessment?.body_html && (
            <div className="dp-section">
              <div className="dp-sec-label">Overall Assessment</div>
              <RichText html={c.assessment.body_html} />
            </div>
          )}

          {/* ── Roadmap (milestones) ── */}
          {milestones.length > 0 && (
            <div className="dp-section">
              <div className="dp-sec-label">Roadmap</div>
              <div className="dp-paths">
                {milestones.map((m, i) => (
                  <div key={m.id} className="dp-path print-keep-color">
                    <div className="dp-path-num">{i + 1}</div>
                    <div>
                      <h4>{m.title}</h4>
                      {m.description && <p>{m.description}</p>}
                      {m.due_date && (
                        <p style={{ marginTop: 4, color: '#9a7420', fontWeight: 600 }}>
                          Due {new Date(m.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                    <div className={`dp-fit ${m.status === 'done' ? 'strongest' : m.status === 'in_progress' ? 'strong' : 'emerging'} print-keep-color`}>
                      {m.status === 'done' ? 'Done' : m.status === 'in_progress' ? 'In progress' : 'Pending'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Training & Roles (legacy free-text) ── */}
          {training.length > 0 && (
            <div className="dp-section">
              <div className="dp-sec-label">Training &amp; Workshops</div>
              <div className="dp-companies">
                {training.map((it, i) => (
                  <div key={i} className="dp-company-cat print-keep-color">
                    {it.box1 && <h4>{it.box1}</h4>}
                    {it.box2 && <p className="dp-prose" style={{ whiteSpace: 'pre-wrap' }}>{it.box2}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {roles.length > 0 && (
            <div className="dp-section">
              <div className="dp-sec-label">Roles &amp; Ideas</div>
              <div className="dp-companies">
                {roles.map((it, i) => (
                  <div key={i} className="dp-company-cat print-keep-color">
                    {it.box1 && <h4>{it.box1}</h4>}
                    {it.box2 && <p className="dp-prose" style={{ whiteSpace: 'pre-wrap' }}>{it.box2}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="dp-doc-footer">
            <span className="conf">Confidential</span>
            <span>{coverName} — Development Plan</span>
            <span>Athletes to Industry</span>
          </div>
        </div>
      </section>
    </div>
  );
}
