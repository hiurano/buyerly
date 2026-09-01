/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"Berkeley Mono"', '"JetBrains Mono"', 'monospace'],
      },
      colors: {
        linear: {
          bgDark: '#09090a',
          bgSecondaryDark: '#121213',
          borderDark: '#212224',
          textDark: '#ffffff',
          textMutedDark: '#6b6f76',
          textTertiaryDark: '#97979a',
          accent: '#5e6ad2',
          accentHover: '#6875e5',
        }
      }
    },
  },
  plugins: [],
}
