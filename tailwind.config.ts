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
        brand: {
          void:     '#0A0A14',
          deep:     '#0F0F1E',
          panel:    '#13132A',
          violet:   '#6B21FF',
          purple:   '#9333EA',
          pink:     '#E040FB',
          hotpink:  '#F472B6',
          cyan:     '#4DB8FF',
          ice:      '#A5F3FC',
          slate:    '#8892A4',
          muted:    '#3D3D5C',
          offwhite: '#F0EEFF',
          light:    '#1A1A35',
        },
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['Rajdhani', 'Inter', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
      backgroundImage: {
        'gradient-brand':   'linear-gradient(135deg, #6B21FF 0%, #E040FB 100%)',
        'gradient-cyber':   'linear-gradient(135deg, #0A0A14 0%, #0F0F1E 50%, #13132A 100%)',
        'gradient-glow':    'radial-gradient(ellipse at 50% 0%, rgba(107,33,255,0.3) 0%, transparent 70%)',
        'gradient-pink':    'linear-gradient(135deg, #9333EA 0%, #E040FB 100%)',
        'gradient-cyan':    'linear-gradient(135deg, #4DB8FF 0%, #A5F3FC 100%)',
        'grid-cyber':       'linear-gradient(rgba(107,33,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(107,33,255,0.07) 1px, transparent 1px)',
      },
      backgroundSize: {
        'grid': '40px 40px',
      },
      boxShadow: {
        'glow-violet': '0 0 20px rgba(107,33,255,0.5), 0 0 40px rgba(107,33,255,0.2)',
        'glow-pink':   '0 0 20px rgba(224,64,251,0.5), 0 0 40px rgba(224,64,251,0.2)',
        'glow-cyan':   '0 0 20px rgba(77,184,255,0.5), 0 0 40px rgba(77,184,255,0.2)',
        'panel':       '0 0 0 1px rgba(107,33,255,0.2), 0 4px 24px rgba(0,0,0,0.4)',
      },
      clipPath: {
        'cyber':    'polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))',
        'cyber-sm': 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
      },
      animation: {
        'pulse-slow':  'pulse 3s ease-in-out infinite',
        'scan':        'scan 4s linear infinite',
        'flicker':     'flicker 6s ease-in-out infinite',
        'glow-pulse':  'glow-pulse 2s ease-in-out infinite',
      },
      keyframes: {
        scan: {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        flicker: {
          '0%, 95%, 100%': { opacity: '1' },
          '96%':           { opacity: '0.8' },
          '97%':           { opacity: '1' },
          '98%':           { opacity: '0.6' },
          '99%':           { opacity: '1' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(107,33,255,0.4)' },
          '50%':      { boxShadow: '0 0 40px rgba(224,64,251,0.6)' },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
