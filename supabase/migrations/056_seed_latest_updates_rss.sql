-- ═══════════════════════════════════════════════════════════
-- Phase 56: Seed RSS feed sources for /latest-updates
--
-- Curated set of UK-focused HR, employment law, recruitment and
-- workforce-data feeds. Hourly cron at admin/api/cron/ingest-feeds
-- runs ingestFeed() against every active source.
--
-- Re-run safe: ON CONFLICT (slug) keeps the row id stable so any
-- existing latest_updates.feed_source_id references stay valid.
-- ═══════════════════════════════════════════════════════════

INSERT INTO feed_sources (slug, display_name, feed_url, source_type, category, active)
VALUES
  ('personnel-today',         'Personnel Today',                'https://www.personneltoday.com/feed/',                                              'rss', 'HR News',              true),
  ('hr-magazine',             'HR Magazine',                    'https://www.hrmagazine.co.uk/feed',                                                 'rss', 'HR News',              true),
  ('peoplemanagement',        'People Management (CIPD)',       'https://www.peoplemanagement.co.uk/feed',                                           'rss', 'HR News',              true),
  ('hr-review',               'HR Review',                      'https://www.hrreview.co.uk/feed',                                                   'rss', 'HR News',              true),
  ('cipd-news',               'CIPD News',                      'https://www.cipd.org/uk/views-and-insights/cipd-voice/rss/',                        'rss', 'HR Insight',           true),
  ('acas-news',               'Acas',                           'https://www.acas.org.uk/news.rss',                                                  'rss', 'Employment Law',       true),
  ('gov-employment',          'gov.uk Employment',              'https://www.gov.uk/search/news-and-communications.atom?topical_events%5B%5D=employment-rights-bill', 'rss', 'Employment Law', true),
  ('lewissilkin-insights',    'Lewis Silkin Employment',        'https://www.lewissilkin.com/en/insights/employment.rss',                            'rss', 'Employment Law',       true),
  ('rec-news',                'Recruitment & Employment Confederation', 'https://www.rec.uk.com/our-view/news/rss',                                  'rss', 'Recruitment',          true),
  ('reed-blog',               'Reed Recruiter Insight',         'https://www.reed.co.uk/recruiter-advice/feed/',                                     'rss', 'Recruitment',          true),
  ('ons-labour-market',       'ONS Labour Market',              'https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/rss',                 'rss', 'Workforce Data',       true),
  ('hbr-talent',              'Harvard Business Review: Talent','https://hbr.org/topic/subject/hiring-and-recruitment/feed',                          'rss', 'HR Insight',           true),
  ('hbr-leadership',          'Harvard Business Review: Leadership','https://hbr.org/topic/subject/leadership/feed',                                 'rss', 'Leadership',           true),
  ('mckinsey-people',         'McKinsey People & Organizational Performance', 'https://www.mckinsey.com/featured-insights/rss',                      'rss', 'HR Insight',           true),
  ('shrm-news',               'SHRM Today',                     'https://www.shrm.org/rss/Pages/AllSHRM.aspx',                                       'rss', 'HR Insight',           true)
ON CONFLICT (slug) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      feed_url     = EXCLUDED.feed_url,
      source_type  = EXCLUDED.source_type,
      category     = EXCLUDED.category,
      active       = EXCLUDED.active;
