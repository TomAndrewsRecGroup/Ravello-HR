// Site-wide JSON-LD. Rendered once from the root layout. Page-specific
// Service / Article / FAQPage / BreadcrumbList schemas are emitted from
// the page itself via <PageSchema>.

const SITE_URL = 'https://thepeoplesystem.co.uk';
const LOGO     = 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/the%20people%20system%20%282%29.png';

export default function StructuredData() {
  const org = {
    '@context': 'https://schema.org',
    '@type': ['Organization', 'ProfessionalService'],
    '@id': `${SITE_URL}#organization`,
    name: 'The People System',
    legalName: 'The People System Ltd',
    url: SITE_URL,
    logo: LOGO,
    image: LOGO,
    description:
      'The People System is a UK HR consultancy delivering HIRE, LEAD and PROTECT as one connected operating model: embedded recruitment, fractional HR leadership and Employment Rights Bill ready compliance for ambitious SMEs.',
    slogan: 'Hire. Lead. Protect.',
    foundingDate: '2024',
    founders: [
      { '@type': 'Person', name: 'Lucy', jobTitle: 'Co-founder, HR Director' },
      { '@type': 'Person', name: 'Tom Andrews', jobTitle: 'Co-founder, Talent Lead' },
    ],
    areaServed: { '@type': 'Country', name: 'United Kingdom' },
    knowsAbout: [
      'Embedded recruitment', 'Fractional HR', 'TUPE',
      'M&A people due diligence', 'Employment Rights Bill',
      'HR compliance', 'Talent strategy', 'L&D strategy',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      email: 'info@thepeoplesystem.co.uk',
      url: `${SITE_URL}/book`,
      areaServed: 'GB',
      availableLanguage: ['en-GB'],
    },
    sameAs: [
      'https://www.linkedin.com/company/the-people-system',
    ],
    makesOffer: [
      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'HIRE', url: `${SITE_URL}/hire` } },
      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'LEAD', url: `${SITE_URL}/lead` } },
      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'PROTECT', url: `${SITE_URL}/protect` } },
    ],
  };

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}#website`,
    url: SITE_URL,
    name: 'The People System',
    publisher: { '@id': `${SITE_URL}#organization` },
    inLanguage: 'en-GB',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/latest-updates?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };

  const founders = [
    {
      '@context': 'https://schema.org',
      '@type': 'Person',
      '@id': `${SITE_URL}/about#lucy`,
      name: 'Lucy',
      jobTitle: 'Co-founder, HR Director',
      worksFor: { '@id': `${SITE_URL}#organization` },
      image: `${SITE_URL}/Lucy.jpg`,
      knowsAbout: ['HR strategy', 'Employment Rights Bill', 'TUPE', 'Restructure', 'Disciplinary and grievance', 'Policy design'],
      hasCredential: { '@type': 'EducationalOccupationalCredential', credentialCategory: 'CIPD' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Person',
      '@id': `${SITE_URL}/about#tom`,
      name: 'Tom Andrews',
      jobTitle: 'Co-founder, Talent Lead',
      worksFor: { '@id': `${SITE_URL}#organization` },
      image: `${SITE_URL}/Tom.jpg`,
      knowsAbout: ['Embedded recruitment', 'Talent strategy', 'Friction Lens (IvyLens)', 'Hiring process design'],
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }} />
      {founders.map((p, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(p) }} />
      ))}
    </>
  );
}
