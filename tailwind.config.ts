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
        bg:           'var(--bg)',
        surface:      'var(--surface)',
        'surface-alt':'var(--surface-alt)',
        ink:          'var(--ink)',
        'ink-soft':   'var(--ink-soft)',
        'ink-faint':  'var(--ink-faint)',
        navy:         'var(--brand-navy)',
        blue:         'var(--brand-blue)',
        purple:       'var(--brand-purple)',
        pink:         'var(--brand-pink)',
        line:         'var(--brand-line)',
      },
      fontFamily: {
        display: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
        sans:    ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-xl': ['clamp(2.75rem, 6vw, 5rem)',   { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'display-lg': ['clamp(2rem, 4vw, 3.5rem)',    { lineHeight: '1.1',  letterSpacing: '-0.02em' }],
        'display-md': ['clamp(1.5rem, 3vw, 2.25rem)', { lineHeight: '1.2',  letterSpacing: '-0.015em' }],
      },
      spacing: {
        section: '7rem',
        'section-sm': '4rem',
      },
      borderRadius: {
        card: '20px',
        'card-sm': '14px',
      },
      boxShadow: {
        card:  '0 1px 3px rgba(14,22,51,0.06), 0 8px 32px rgba(14,22,51,0.07)',
        'card-hover': '0 2px 8px rgba(14,22,51,0.08), 0 16px 48px rgba(14,22,51,0.12)',
        btn:   '0 1px 3px rgba(14,22,51,0.2), 0 4px 12px rgba(14,22,51,0.12)',
        'btn-hover': '0 2px 8px rgba(14,22,51,0.25), 0 8px 24px rgba(14,22,51,0.15)',
        glow:  '0 0 60px rgba(143,114,246,0.15), 0 0 120px rgba(143,114,246,0.07)',
      },
      animation: {
        'fade-up':   'fadeUp 0.6s ease forwards',
        'fade-in':   'fadeIn 0.4s ease forwards',
        'glow-soft': 'glowSoft 4s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        glowSoft: {
          '0%, 100%': { opacity: '0.6' },
          '50%':      { opacity: '1' },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
