/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f6f7f9', 100: '#eceef2', 200: '#d5d9e1', 300: '#b1b8c6', 400: '#8791a5',
          500: '#68738a', 600: '#535c71', 700: '#444b5c', 800: '#2b303b', 850: '#1f232c', 900: '#171a21', 950: '#0f1116',
        },
        accent: { 300: '#99f6e4', 400: '#5eead4', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e' },
        // Training theme (docs/DESIGN.md §4): CSS variables on `.train`, so the accent preset can change at run time.
        t: {
          bg: 'var(--t-bg)', surface: 'var(--t-surface)', line: 'var(--t-line)', text: 'var(--t-text)', dim: 'var(--t-dim)',
          accent: 'var(--t-accent)', on: 'var(--t-on-accent)', good: 'var(--t-good)', warn: 'var(--t-warn)', danger: 'var(--t-danger)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        // Condensed, heavy, system-only (no network fonts): numbers, training titles, primary buttons, labels.
        display: ['"Avenir Next Condensed"', '"HelveticaNeue-CondensedBold"', '"Roboto Condensed"', 'Bahnschrift', '"Arial Narrow"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        hero: ['clamp(4.5rem, 24vw, 7.5rem)', { lineHeight: '0.9' }],
        'num-xl': ['3.5rem', { lineHeight: '1' }],
        'num-lg': ['2.25rem', { lineHeight: '1' }],
        title: ['1.75rem', { lineHeight: '1.1' }],
        label: ['0.6875rem', { lineHeight: '1.2', letterSpacing: '0.12em' }],
      },
    },
  },
  plugins: [],
};
