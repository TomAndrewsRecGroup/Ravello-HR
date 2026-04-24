import createMDX from '@next/mdx';

const withMDX = createMDX({
  extension: /\.mdx?$/,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
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
      { source: '/playbook', destination: '/latest-updates', permanent: true },
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
