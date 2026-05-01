// Per-page JSON-LD. Drop into any page to emit a BreadcrumbList,
// optional FAQPage, optional Service, or optional Article block.
// Models cite structured pages — keep this on every page.

const SITE_URL = 'https://thepeoplesystem.co.uk';

export interface ServiceSchema {
  name: string;
  description: string;
  url: string;
  serviceType?: string;
  offers?: Array<{ name: string; description?: string; price?: string; priceCurrency?: string }>;
}

export interface ArticleSchema {
  headline: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified?: string;
  authorName?: string;
  image?: string;
}

export interface BreadcrumbItem { name: string; url: string }
export interface FaqItem        { q: string; a: string }

export interface PageSchemaProps {
  breadcrumbs?: BreadcrumbItem[];
  faqs?: FaqItem[];
  service?: ServiceSchema;
  article?: ArticleSchema;
}

export default function PageSchema({ breadcrumbs, faqs, service, article }: PageSchemaProps) {
  const blocks: Record<string, unknown>[] = [];

  if (breadcrumbs && breadcrumbs.length > 0) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbs.map((b, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: b.name,
        item: b.url.startsWith('http') ? b.url : `${SITE_URL}${b.url}`,
      })),
    });
  }

  if (faqs && faqs.length > 0) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
  }

  if (service) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: service.name,
      description: service.description,
      url: service.url,
      serviceType: service.serviceType ?? 'HR consultancy',
      provider: { '@id': `${SITE_URL}#organization` },
      areaServed: { '@type': 'Country', name: 'United Kingdom' },
      ...(service.offers && {
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: `${service.name} packages`,
          itemListElement: service.offers.map((o) => ({
            '@type': 'Offer',
            itemOffered: { '@type': 'Service', name: o.name, description: o.description },
            ...(o.price && { price: o.price, priceCurrency: o.priceCurrency ?? 'GBP' }),
          })),
        },
      }),
    });
  }

  if (article) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.headline,
      description: article.description,
      url: article.url,
      datePublished: article.datePublished,
      dateModified: article.dateModified ?? article.datePublished,
      ...(article.image && { image: article.image }),
      author: article.authorName
        ? { '@type': 'Person', name: article.authorName }
        : { '@id': `${SITE_URL}#organization` },
      publisher: { '@id': `${SITE_URL}#organization` },
      mainEntityOfPage: article.url,
    });
  }

  return (
    <>
      {blocks.map((b, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(b) }} />
      ))}
    </>
  );
}
