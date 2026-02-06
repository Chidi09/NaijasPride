const { join } = require('path');

module.exports = {
  content: [join(__dirname, 'src/**/!(*.stories|*.spec).{ts,html}')],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1B5E20',
          light: '#4CAF50',
          dark: '#0D3B12',
        },
        secondary: {
          DEFAULT: '#FF6D00',
        },
        accent: {
          DEFAULT: '#FFD600',
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
