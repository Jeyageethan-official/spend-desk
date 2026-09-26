/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        spenddesk: {
          DEFAULT: '#116b4e',
          hover: '#0d5940',
          dark: '#093f2d',
          light: '#188663',
          bg: '#eaf5f0',
        }
      }
    },
  },
  plugins: [],
}
