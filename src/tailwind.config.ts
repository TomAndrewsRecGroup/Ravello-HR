import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:            'var(--bg)',
        surface:       'var(--surface)',
        'surface-alt': 'var(--surface-alt)',
        'surface-soft':'var(--surface-soft)',
        ink:           'var(--ink)',
        'ink-soft':    'var(--ink-soft)',
        'ink-faint':   'var(--ink-faint)',
        navy:          'var(--brand-navy)',
        blue:          'var(--brand-blue)',
        purple:        'var(--brand-purple)',
        pink:          'var(--brand-pink)',
        line:          'var(--brand-line)',
      },
      fontFamily: {
        sans:    ['var(--font-dm-sans)', 'DM Sans', 'system-ui', 'sans-serif'],
        display: ['var(--font-dm-sans)', 'DM Sans', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '22px',
        'card-sm': '14px',
      },
      animation: {
        'fade-up':   'fadeUp 0.6s ease forwards',
        'fade-in':   'fadeIn 0.4s ease forwards',
        'glow-soft': 'glowSoft 4s ease-in-out infinite',
      },
      keyframes: {
        fadeUp:   { from: { opacity: '0', transform: 'translateY(20px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        fadeIn:   { from: { opacity: '0' }, to: { opacity: '1' } },
        glowSoft: { '0%, 100%': { opacity: '0.6' }, '50%': { opacity: '1' } },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
