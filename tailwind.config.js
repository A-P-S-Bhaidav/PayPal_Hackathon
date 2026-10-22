/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        paypal: {
          navy: '#001C64',
          blue: '#0070E0',
          sky: '#009CDE',
          gold: '#FFC439',
        },
      },
    },
  },
  plugins: [],
};
