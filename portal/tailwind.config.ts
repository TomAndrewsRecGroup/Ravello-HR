import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
    './src/app/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy:    'var(--navy)',
        purple:  'var(--purple)',
        blue:    'var(--blue)',
        gold:    'var(--gold)',
        teal:    'var(--teal)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger:  'var(--danger)',
      },
      fontFamily: {
        display: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        sans:    ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
