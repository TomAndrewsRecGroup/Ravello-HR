import createMDX from '@next/mdx';

const withMDX = createMDX({
  extension: /\.mdx?$/,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        // Vercel Blob storage — used for Ravello HR logo
        protocol: 'https',
        hostname: 'haaqtnq6favvrbuh.public.blob.vercel-storage.com',
      },
      {
        // Wildcard for any future Vercel Blob stores
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
    ],
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
