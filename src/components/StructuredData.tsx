export default function StructuredData() {
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'The People System',
    url: 'https://thepeoplesystem.co.uk',
    logo: 'https://thepeoplesystem.co.uk/logo.png',
    description:
      'The People System delivers HIRE, LEAD, and PROTECT: embedded recruitment, fractional HR leadership, and compliance foundations for founder-led and PE-backed businesses.',
    founders: [
      { '@type': 'Person', name: 'Lucy' },
      { '@type': 'Person', name: 'Tom Andrews' },
    ],
    areaServed: 'GB',
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      url: 'https://thepeoplesystem.co.uk/book',
    },
  };

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    url: 'https://thepeoplesystem.co.uk',
    name: 'The People System',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://thepeoplesystem.co.uk/playbook?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  };

  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is Friction Lens?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Friction Lens is a role scoring technology built by Tom Andrews through IvyLens Technology. It scores every active role across five dimensions: Location, Salary, Skills, Working Model, and Process: before it goes to market, and provides specific recommendations to reduce friction before you recruit. The People System integrates Friction Lens into every HIRE engagement as standard.',
        },
      },
      {
        '@type': 'Question',
        name: 'What is PROTECT?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'PROTECT is the HR foundations pillar of The People System. Lucy builds the contracts, handbook, and policies your business genuinely needs: compliant with current UK legislation including the Employment Rights Bill.',
        },
      },
      {
        '@type': 'Question',
        name: 'What HR support is available for M&A?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'DealReady People\u2122 supports businesses pre- and post-acquisition with people due diligence, TUPE, restructuring risk, and integration. It is a specialist project service, not a retainer product.',
        },
      },
      {
        '@type': 'Question',
        name: 'How do I book a free call with The People System?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Book directly at thepeoplesystem.co.uk/book. Three routes: I need help hiring, I need HR foundations, or I\u2019m going through a deal. No pitch. No obligation.',
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
