import type { MetadataRoute } from 'next';

const BASE_URL = 'https://ravellohr.co.uk';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    // Homepage — highest priority
    { url: `${BASE_URL}/`,                                  lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },

    // Product hubs — primary acquisition pages
    { url: `${BASE_URL}/smart-hiring-system`,               lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/policysafe`,                        lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/dealready-people`,                  lastModified: now, changeFrequency: 'monthly', priority: 0.9 },

    // Diagnostic tools
    { url: `${BASE_URL}/smart-hiring-system/score`,         lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/policysafe/healthcheck`,            lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/policysafe/templates`,              lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/dealready-people/pre-check`,        lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/dealready-people/checklist`,        lastModified: now, changeFrequency: 'monthly', priority: 0.7 },

    // Supporting pages
    { url: `${BASE_URL}/services`,                          lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/about`,                             lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/partners`,                          lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/contact`,                           lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
  ];
  // Note: /privacy-policy and /terms are excluded — robots: noindex
  // Portal and admin are separate deployments — not listed here
}
