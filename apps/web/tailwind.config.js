const { join } = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [join(__dirname, 'src/**/!(*.stories|*.spec).{ts,html}')],
  theme: {
    extend: {
      animation: {
        'marquee-tv': 'marquee-tv 40s linear infinite',
        'marquee-anime': 'marquee-anime 40s linear infinite',
      },
      keyframes: {
        'marquee-tv': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(calc(-50% - 0.625rem))' },
        },
        'marquee-anime': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(calc(-50% - 0.375rem))' },
        }
      },
      colors: {
        // "Old Money" Palette
        cinema: {
          900: 'rgb(var(--cinema-900) / <alpha-value>)',
          800: 'rgb(var(--cinema-800) / <alpha-value>)',
          700: 'rgb(var(--cinema-700) / <alpha-value>)',
          500: 'rgb(var(--cinema-500) / <alpha-value>)',
          400: 'rgb(var(--cinema-400) / <alpha-value>)',
          100: 'rgb(var(--cinema-100) / <alpha-value>)',
          50: 'rgb(var(--cinema-50) / <alpha-value>)',
        }
      },
      fontFamily: {
        serif: ['Cinzel', 'serif'],           // For Headers (NaijasPride look)
        sans: ['Plus Jakarta Sans', 'sans-serif'], // For UI/Body
      },
      backgroundImage: {
        'vignette': 'radial-gradient(circle, rgba(0,0,0,0) 0%, rgba(10,10,10,0.8) 100%)',
      }
    },
  },
  plugins: [],
};
