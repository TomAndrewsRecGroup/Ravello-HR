export default function StructuredData() {
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Ravello HR',
    url: 'https://ravellohr.co.uk',
    logo: 'https://ravellohr.co.uk/logo.png',
    description:
      'Ravello HR delivers named HR systems for ambitious businesses — Smart Hiring System™, PolicySafe™ and DealReady People™.',
    founder: {
      '@type': 'Person',
      name: 'Lucinda Reader',
    },
    areaServed: 'GB',
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      url: 'https://ravellohr.co.uk/book',
    },
  };

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    url: 'https://ravellohr.co.uk',
    name: 'Ravello HR',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://ravellohr.co.uk/playbook?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  };

  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is the Smart Hiring System?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'The Smart Hiring System is Ravello HR's proprietary methodology to fix hiring drift — reducing time-to-hire, cutting agency spend, and stopping roles from being reopened within months.',
        },
      },
      {
        '@type': 'Question',
        name: 'What is PolicySafe™?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'PolicySafe™ is Ravello HR's compliance and documentation system for small and growing businesses — covering contracts, handbooks, and manager enablement.',
        },
      },
      {
        '@type': 'Question',
        name: 'What HR support is available for M&A?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'DealReady People™ supports businesses pre- and post-acquisition with people due diligence, TUPE, restructuring risk, and culture integration.',
        },
      },
      {
        '@type': 'Question',
        name: 'How do I book a free consultation with Ravello HR?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'You can book a free 15-minute clarity call directly at ravellohr.co.uk/book — no forms, no fluff.',
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }}
      />
    </>
  );
}
