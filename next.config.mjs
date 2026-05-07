import createMDX from '@next/mdx';

const withMDX = createMDX({
  extension: /\.mdx?$/,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
  experimental: {
    // Tree-shake lucide-react so each marketing page only ships the
    // icons it actually imports. ~30KB shaved off the homepage
    // bundle alone. admin/portal already do this.
    optimizePackageImports: ['lucide-react'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'haaqtnq6favvrbuh.public.blob.vercel-storage.com' },
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
      // Latest Updates feed image sources
      { protocol: 'https', hostname: 'www.personneltoday.com' },
      { protocol: 'https', hostname: 'www.hrreview.co.uk' },
      { protocol: 'https', hostname: 'www.fenews.co.uk' },
      { protocol: 'https', hostname: 'www.fecareers.co.uk' },
      { protocol: 'https', hostname: 'www.govwire.co.uk' },
      { protocol: 'https', hostname: 'www.cipd.org' },
      { protocol: 'https', hostname: 'media.licdn.com' },
    ],
  },
  async redirects() {
    return [
      { source: '/playbook',      destination: '/latest-updates', permanent: true },
      { source: '/why-ravello',   destination: '/why-tps',         permanent: true },
      { source: '/friction-lens', destination: '/hire',            permanent: true },
    ];
  },
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/admin/**', '**/portal/**', '**/node_modules/**'],
    };
    return config;
  },
};

export default withMDX(nextConfig);
