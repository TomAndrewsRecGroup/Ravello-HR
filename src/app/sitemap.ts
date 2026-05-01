import type { MetadataRoute } from 'next';

const SITE_URL = 'https://thepeoplesystem.co.uk';

const ROUTES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
  { path: '',                              priority: 1.00, changeFrequency: 'weekly'  },
  { path: '/hire',                         priority: 0.90, changeFrequency: 'monthly' },
  { path: '/lead',                         priority: 0.90, changeFrequency: 'monthly' },
  { path: '/protect',                      priority: 0.90, changeFrequency: 'monthly' },
  { path: '/why-tps',                      priority: 0.85, changeFrequency: 'monthly' },
  { path: '/about',                        priority: 0.80, changeFrequency: 'monthly' },
  { path: '/smart-hiring-system',          priority: 0.80, changeFrequency: 'monthly' },
  { path: '/policysafe',                   priority: 0.80, changeFrequency: 'monthly' },
  { path: '/dealready-people',             priority: 0.80, changeFrequency: 'monthly' },
  { path: '/cost-of-doing-nothing',        priority: 0.80, changeFrequency: 'monthly' },
  { path: '/insights',                     priority: 0.75, changeFrequency: 'weekly'  },
  { path: '/latest-updates',               priority: 0.75, changeFrequency: 'daily'   },
  { path: '/sources',                      priority: 0.60, changeFrequency: 'monthly' },
  { path: '/book',                         priority: 0.70, changeFrequency: 'yearly'  },
  { path: '/tools/hiring-score',           priority: 0.60, changeFrequency: 'yearly'  },
  { path: '/tools/hr-risk-score',          priority: 0.60, changeFrequency: 'yearly'  },
  { path: '/tools/policy-healthcheck',     priority: 0.60, changeFrequency: 'yearly'  },
  { path: '/tools/due-diligence-checklist',priority: 0.60, changeFrequency: 'yearly'  },
  { path: '/privacy',                      priority: 0.20, changeFrequency: 'yearly'  },
  { path: '/terms',                        priority: 0.20, changeFrequency: 'yearly'  },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
