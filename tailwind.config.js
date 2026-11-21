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
        accent: { 400: '#5eead4', 500: '#14b8a6', 600: '#0d9488' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
