import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',       // API routes — not for crawling
        ],
      },
    ],
    sitemap: 'https://ravellohr.co.uk/sitemap.xml',
    // Note: portal.ravellohr.co.uk and admin.ravellohr.co.uk
    // are separate Vercel projects and have their own robots.txt
    // that blocks all crawling.
  };
}
