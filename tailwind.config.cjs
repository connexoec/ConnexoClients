module.exports = {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
    './contexts/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: '#ff6600',   // Primary Action
          dark: '#210900',     // Background Base
          border: '#962700',   // Secondary / Borders
          peach: '#ffa35d',    // Accent / Hover
          text: '#ffefe5',     // Primary Text
        }
      },
      fontFamily: {
        sans: ['Space Grotesk', 'sans-serif'],
        tomorrow: ['Tomorrow', 'sans-serif'],
      }
    },
  },
  plugins: [],
};
