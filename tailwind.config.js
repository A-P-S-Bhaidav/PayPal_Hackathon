/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Space Grotesk', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        midnight: {
          DEFAULT: '#050507',
          surface: '#0A0C12',
          elevated: '#101420',
          border: '#1B2234',
        },
        cobalt: {
          DEFAULT: '#0047FF',
          bright: '#2962FF',
          muted: '#002B99',
        },
        lime: {
          acid: '#CCFF00',
          dim: '#A8D400',
        },
      },
    },
  },
  plugins: [],
};
