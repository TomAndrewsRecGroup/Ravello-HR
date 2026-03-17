export default function StructuredData() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Ravello',
    url: 'https://ravellohr.co.uk',
    logo: 'https://haaqtnq6favvrbuh.public.blob.vercel-storage.com/d853d50b-40d4-47f4-ac80-7058a2387dac.png',
    description:
      'HR support, structured hiring, and a client portal for growing businesses of 10–250 people.',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'GB',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'hello@ravellohr.co.uk',
      contactType: 'customer service',
      areaServed: 'GB',
    },
    sameAs: ['https://linkedin.com/company/ravellohr'],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
