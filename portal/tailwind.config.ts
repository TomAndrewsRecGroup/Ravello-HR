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
        navy:   '#0E1633',
        purple: '#8F72F6',
        blue:   '#93B8FF',
        pink:   '#E8B6D9',
        teal:   '#5BC4BF',
      },
      fontFamily: {
        display: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
        sans:    ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
