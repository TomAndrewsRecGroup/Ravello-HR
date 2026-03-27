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
        gold:          'var(--brand-gold)',
        'gold-lt':     'var(--brand-gold-lt)',
        'gold-dk':     'var(--brand-gold-dk)',
        line:          'var(--brand-line)',
        proof:         'var(--proof-bg)',
      },
      fontFamily: {
        display: [
          'var(--font-cormorant)',
          'Cormorant Garamond',
          'Georgia',
          'serif',
        ],
        sans: [
          'var(--font-satoshi)',
          'Satoshi',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          'var(--font-mono)',
          'JetBrains Mono',
          'monospace',
        ],
      },
      fontSize: {
        /* Fluid display scale — editorial luxury */
        'display-hero': ['clamp(3.5rem, 7vw, 7rem)',    { lineHeight: '1.03', letterSpacing: '-0.035em' }],
        'display-2xl':  ['clamp(3rem, 6vw, 5.5rem)',    { lineHeight: '1.04', letterSpacing: '-0.03em' }],
        'display-xl':   ['clamp(2.6rem, 5vw, 4.5rem)',  { lineHeight: '1.05', letterSpacing: '-0.03em' }],
        'display-lg':   ['clamp(2rem, 4vw, 3.2rem)',    { lineHeight: '1.06', letterSpacing: '-0.025em' }],
        'display-md':   ['clamp(1.6rem, 3vw, 2.4rem)',  { lineHeight: '1.12', letterSpacing: '-0.02em' }],
        'display-sm':   ['clamp(1.2rem, 2.5vw, 1.8rem)',{ lineHeight: '1.2',  letterSpacing: '-0.015em' }],
      },
      spacing: {
        section:    '8rem',
        'section-sm': '5rem',
      },
      borderRadius: {
        card:    '24px',
        'card-sm': '16px',
        'card-lg': '32px',
      },
      boxShadow: {
        card:        '0 1px 2px rgba(10,15,30,0.03), 0 8px 32px rgba(10,15,30,0.04)',
        'card-hover':'0 4px 20px rgba(10,15,30,0.06), 0 24px 64px rgba(10,15,30,0.08)',
        btn:         '0 1px 4px rgba(10,15,30,0.18), 0 4px 14px rgba(10,15,30,0.08)',
        'btn-hover': '0 2px 10px rgba(10,15,30,0.22), 0 8px 26px rgba(10,15,30,0.12)',
        glow:        '0 0 60px rgba(124,58,237,0.14), 0 0 120px rgba(124,58,237,0.07)',
        'glow-sm':   '0 0 30px rgba(124,58,237,0.18)',
        'glow-lg':   '0 0 80px rgba(124,58,237,0.20), 0 0 160px rgba(59,111,255,0.10)',
        'gold-glow': '0 2px 20px rgba(191,143,40,0.30), 0 1px 6px rgba(191,143,40,0.18)',
        glass:       '0 4px 24px rgba(10,15,30,0.05), inset 0 1px 0 rgba(255,255,255,0.80)',
      },
      animation: {
        'fade-up':       'fadeUp 0.6s ease forwards',
        'fade-in':       'fadeIn 0.4s ease forwards',
        'glow-soft':     'glowSoft 4s ease-in-out infinite',
        'glow-pulse':    'glowPulse 3s ease-in-out infinite',
        'gold-sweep':    'goldSweep 2.8s ease-in-out infinite',
        'node-float':    'nodeFloat 6s ease-in-out infinite',
        'gradient-shift':'gradientShift 8s ease infinite',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        glowSoft: {
          '0%, 100%': { opacity: '0.55' },
          '50%':      { opacity: '1' },
        },
        glowPulse: {
          '0%, 100%': {
            boxShadow: '0 0 20px rgba(124,58,237,0.16), 0 2px 12px rgba(124,58,237,0.10)',
          },
          '50%': {
            boxShadow: '0 0 44px rgba(124,58,237,0.40), 0 0 80px rgba(59,111,255,0.15)',
          },
        },
        goldSweep: {
          '0%':   { transform: 'translateX(-160%)' },
          '55%':  { transform: 'translateX(160%)' },
          '100%': { transform: 'translateX(160%)' },
        },
        nodeFloat: {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)', opacity: '0.55' },
          '33%':      { transform: 'translateY(-14px) rotate(3deg)', opacity: '1' },
          '66%':      { transform: 'translateY(7px) rotate(-2deg)', opacity: '0.7' },
        },
        gradientShift: {
          '0%':   { backgroundPosition: '0% 50%' },
          '50%':  { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
      },
      backdropBlur: {
        xs: '4px',
        sm: '8px',
        md: '14px',
        lg: '20px',
        xl: '28px',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
