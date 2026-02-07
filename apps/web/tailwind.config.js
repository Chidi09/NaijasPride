const { join } = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [join(__dirname, 'src/**/!(*.stories|*.spec).{ts,html}')],
  theme: {
    extend: {
      colors: {
        // "Old Money" Palette
        cinema: {
          900: '#0a0a0a', // Deepest Black (Main bg)
          800: '#121212', // Charcoal (Card bg)
          700: '#1e1e1e', // Lighter Grey (Hover states)
          500: '#800020', // Burgundy (Primary Brand)
          400: '#a31535', // Lighter Burgundy (Hover interactions)
          100: '#F5F5DC', // Cream (Text/Accents)
          50: '#f9f9f2',  // Off-white
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
