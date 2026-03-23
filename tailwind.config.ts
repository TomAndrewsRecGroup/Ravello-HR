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
      },
      fontFamily: {
        display: [
          'var(--font-cormorant)',
          'Cormorant Garamond',
          'Georgia',
          'serif',
        ],
        sans: [
          'var(--font-dm-sans)',
          'DM Sans',
          'system-ui',
          'sans-serif',
        ],
      },
      fontSize: {
        /* Fluid display scale */
        'display-2xl': ['clamp(3.5rem, 7vw, 6rem)',   { lineHeight: '1.03', letterSpacing: '-0.03em' }],
        'display-xl':  ['clamp(2.8rem, 5.5vw, 5rem)', { lineHeight: '1.05', letterSpacing: '-0.025em' }],
        'display-lg':  ['clamp(2.1rem, 4vw, 3.5rem)', { lineHeight: '1.08', letterSpacing: '-0.02em' }],
        'display-md':  ['clamp(1.6rem, 3vw, 2.4rem)', { lineHeight: '1.15', letterSpacing: '-0.015em' }],
        'display-sm':  ['clamp(1.2rem, 2.5vw, 1.8rem)',{ lineHeight: '1.2',  letterSpacing: '-0.01em' }],
      },
      spacing: {
        section:    '7rem',
        'section-sm': '4rem',
      },
      borderRadius: {
        card:    '20px',
        'card-sm': '14px',
        'card-lg': '28px',
      },
      boxShadow: {
        /* Cards */
        card:        '0 1px 3px rgba(7,11,29,0.04), 0 6px 28px rgba(7,11,29,0.05)',
        'card-hover':'0 4px 20px rgba(7,11,29,0.07), 0 20px 56px rgba(7,11,29,0.09)',
        /* Buttons */
        btn:         '0 1px 4px rgba(7,11,29,0.20), 0 4px 14px rgba(7,11,29,0.10)',
        'btn-hover': '0 2px 10px rgba(7,11,29,0.26), 0 8px 26px rgba(7,11,29,0.14)',
        /* Purple glow */
        glow:        '0 0 60px rgba(124,58,237,0.16), 0 0 120px rgba(124,58,237,0.08)',
        'glow-sm':   '0 0 30px rgba(124,58,237,0.22)',
        'glow-lg':   '0 0 80px rgba(124,58,237,0.24), 0 0 160px rgba(59,111,255,0.12)',
        /* Gold glow — quality signals */
        'gold-glow': '0 2px 20px rgba(191,143,40,0.36), 0 1px 6px rgba(191,143,40,0.22)',
        /* Glass */
        glass:       '0 4px 24px rgba(7,11,29,0.06), inset 0 1px 0 rgba(255,255,255,0.85)',
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
          from: { opacity: '0', transform: 'translateY(20px)' },
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
            boxShadow: '0 0 20px rgba(124,58,237,0.18), 0 2px 12px rgba(124,58,237,0.12)',
          },
          '50%': {
            boxShadow: '0 0 44px rgba(124,58,237,0.44), 0 0 80px rgba(59,111,255,0.18)',
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
