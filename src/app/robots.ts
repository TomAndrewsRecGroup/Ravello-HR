import type { MetadataRoute } from 'next';

const SITE_URL = 'https://thepeoplesystem.co.uk';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/auth/'],
      },
      // Explicitly allow major AI crawlers. Default robots are
      // permissive but a few of these check for an explicit allow.
      { userAgent: 'GPTBot',         allow: '/' },
      { userAgent: 'ClaudeBot',      allow: '/' },
      { userAgent: 'Claude-Web',     allow: '/' },
      { userAgent: 'PerplexityBot',  allow: '/' },
      { userAgent: 'Google-Extended',allow: '/' },
      { userAgent: 'CCBot',          allow: '/' },
      { userAgent: 'Applebot',       allow: '/' },
      { userAgent: 'Bytespider',     allow: '/' },
      { userAgent: 'OAI-SearchBot',  allow: '/' },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
